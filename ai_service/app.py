import torch
import json
import urllib.request
import open_clip
from PIL import Image
from flask import Flask, request, jsonify
from ultralytics import YOLO
from sentence_transformers import SentenceTransformer
import numpy as np
import cv2
import subprocess
import os

from decord import VideoReader, cpu

from torchvision.transforms import Compose, Lambda
from torchvision.transforms._transforms_video import (
    CenterCropVideo,
    NormalizeVideo,
)
from pytorchvideo.data.encoded_video import EncodedVideo
from pytorchvideo.transforms import (
    ApplyTransformToKey,
    ShortSideScale,
    UniformTemporalSubsample,
    UniformCropVideo,
)

# =========================
# INIT
# =========================
app = Flask(__name__)
device = "cuda" if torch.cuda.is_available() else "cpu"

# YOLO
yolo_model = YOLO("yolov8m.pt")

# CLIP
clip_model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-B-32",
    pretrained="laion2b_s34b_b79k"
)
clip_model = clip_model.to(device)
clip_model.eval()
clip_tokenizer = open_clip.get_tokenizer("ViT-B-32")

# Sentence Transformer
text_model = SentenceTransformer("all-MiniLM-L6-v2", device=device)

# =========================
# SLOWFAST MODEL
# Two pathways: slow (spatial detail) + fast (motion dynamics)
# Trained on Kinetics-400, 76.94% top-1 accuracy
# Much better at detecting motion-heavy actions like fighting
# =========================
slowfast_model = torch.hub.load(
    "facebookresearch/pytorchvideo",
    "slowfast_r50",
    pretrained=True
)
slowfast_model = slowfast_model.to(device)
slowfast_model.eval()

# Download Kinetics-400 label mapping
KINETICS_LABELS_URL = "https://dl.fbaipublicfiles.com/pyslowfast/dataset/class_names/kinetics_classnames.json"
KINETICS_LABELS_PATH = "kinetics_classnames.json"

if not os.path.exists(KINETICS_LABELS_PATH):
    urllib.request.urlretrieve(KINETICS_LABELS_URL, KINETICS_LABELS_PATH)

with open(KINETICS_LABELS_PATH, "r") as f:
    kinetics_classnames = json.load(f)

# id -> label name
kinetics_id_to_classname = {}
for k, v in kinetics_classnames.items():
    kinetics_id_to_classname[v] = str(k).replace('"', "")

print(f"SlowFast loaded on {device}, {len(kinetics_id_to_classname)} Kinetics-400 labels")
print("All models loaded successfully on", device)

# =========================
# SLOWFAST TRANSFORM PARAMS
# These are fixed by how SlowFast was trained — do not change
# =========================
SIDE_SIZE    = 256
MEAN         = [0.45, 0.45, 0.45]
STD          = [0.225, 0.225, 0.225]
CROP_SIZE    = 256
NUM_FRAMES   = 32       # total frames sampled per clip
SAMPLING_RATE = 2       # sample every 2nd frame
FPS          = 30
SLOWFAST_ALPHA = 4      # slow pathway = NUM_FRAMES / ALPHA = 8 frames


class PackPathway(torch.nn.Module):
    """
    Splits a single frame tensor into [slow_pathway, fast_pathway].
    SlowFast requires this two-pathway input format.
    """
    def __init__(self):
        super().__init__()

    def forward(self, frames: torch.Tensor):
        fast_pathway = frames
        slow_pathway = torch.index_select(
            frames,
            1,
            torch.linspace(
                0,
                frames.shape[1] - 1,
                frames.shape[1] // SLOWFAST_ALPHA
            ).long(),
        )
        return [slow_pathway, fast_pathway]


slowfast_transform = ApplyTransformToKey(
    key="video",
    transform=Compose([
        UniformTemporalSubsample(NUM_FRAMES),
        Lambda(lambda x: x / 255.0),
        NormalizeVideo(MEAN, STD),
        ShortSideScale(size=SIDE_SIZE),
        CenterCropVideo(CROP_SIZE),
        PackPathway(),
    ]),
)

# Clip duration driven by model params
CLIP_DURATION = (NUM_FRAMES * SAMPLING_RATE) / FPS  # = 2.133s per clip


# =========================
# HELPERS
# =========================
def ensure_h264(video_path):
    output_path = video_path + "_h264.mp4"

    if os.path.exists(output_path):
        return output_path

    FFMPEG_PATH = r"C:\Users\ASUS\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"

    subprocess.run([
        FFMPEG_PATH,
        "-y",
        "-i", video_path,
        "-vcodec", "libx264",
        "-acodec", "aac",
        output_path
    ])

    return output_path


def get_video_windows(video_path, window_duration=None, overlap=0.5):
    """
    Returns a list of (start_sec, end_sec) windows covering the full video.
    window_duration defaults to CLIP_DURATION if not specified.
    overlap=0.5 means 50% overlap between consecutive windows.
    """
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    cap.release()

    duration_sec = total_frames / fps
    window = window_duration or CLIP_DURATION
    step = window * (1 - overlap)

    print(f"[DEBUG VIDEO] duration={duration_sec:.1f}s, window={window:.2f}s, step={step:.2f}s")

    windows = []
    start = 0.0
    while start + window <= duration_sec:
        windows.append((start, start + window))
        start += step

    # Catch tail end if any
    if start < duration_sec:
        windows.append((max(0, duration_sec - window), duration_sec))

    print(f"[DEBUG VIDEO] {len(windows)} windows to evaluate")
    return windows


# =========================
# FORENSIC ACTION TAXONOMY
# Based on actual Kinetics-400 label names
# =========================
FORENSIC_TAGS = {
    "fighting": [
        "punch",        # "punching bag", "punching person (boxing)"
        "kick",         # "drop kicking", "high kick"
        "slap",         # "slapping"
        "wrestl",       # "wrestling"
        "headbutt",     # "headbutting"
        "sword fight",  # "sword fighting"
        "capoeira",     # martial art
        "krump",        # aggressive movement
        "arm wrestl",   # "arm wrestling"
        "fight",
        "attack",
        "martial",
        "battle",
        "chok",
        "stab",
        "assault",
    ],
    "weapons": [
        "shooting",
        "archery",
        "sword",
        "gun",
        "knife",
        "dagger",
    ],
    "fleeing": [
        "running",
        "jogging",
        "sprint",
        "climbing",
        "jumping",
        "parkour",
        "hurdling",
    ],
    "driving": [
        "driving car",
        "driving tractor",
        "riding",
        "cycling",
        "motorcycl",
        "jetski",
    ],
    "suspicious": [
        "crawling",
        "sneaking",
        "hiding",
        "lock",
        "breaking",
        "vandal",
        "theft",
        "steal",
    ],
    "normal": [],
}

def get_forensic_tag(label: str) -> str:
    label_lower = label.lower()
    for tag, keywords in FORENSIC_TAGS.items():
        if any(k in label_lower for k in keywords):
            return tag
    return "normal"


def score_window(window_results):
    """
    Score a window for forensic relevance.
    Non-normal top-1 wins. If top-1 is normal, partial credit
    if any top-5 result is non-normal.
    """
    top1 = window_results[0]
    if top1["forensic_tag"] != "normal":
        return top1["confidence"]
    for r in window_results[1:]:
        if r["forensic_tag"] != "normal":
            return r["confidence"] * 0.5
    return top1["confidence"] * 0.2


# =========================
# IMAGE EMBEDDING
# =========================
@app.route("/embed-image", methods=["POST"])
def embed_image():
    try:
        image_path = request.json["image_path"]
        image = preprocess(Image.open(image_path).convert("RGB")).unsqueeze(0).to(device)

        with torch.no_grad():
            image_features = clip_model.encode_image(image)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

        return jsonify({"embedding": image_features[0].cpu().tolist()})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =========================
# TEXT EMBEDDING
# =========================
@app.route("/embed-text-clip", methods=["POST"])
def embed_text_clip():
    try:
        text = request.json["text"]
        tokens = clip_tokenizer([text]).to(device)

        with torch.no_grad():
            text_features = clip_model.encode_text(tokens)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

        return jsonify({"embedding": text_features[0].cpu().tolist()})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =========================
# DOCUMENT EMBEDDING
# =========================
@app.route("/embed-document", methods=["POST"])
def embed_document():
    try:
        text = request.json["text"]
        embedding = text_model.encode(text, normalize_embeddings=True)
        return jsonify({"embedding": embedding.tolist()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =========================
# YOLO OBJECT DETECTION
# =========================
@app.route("/detect-objects", methods=["POST"])
def detect_objects():
    image_path = request.json["image_path"]
    results = yolo_model(image_path, conf=0.25)

    detected = set()
    for r in results:
        for box in r.boxes:
            label = yolo_model.names[int(box.cls[0])]
            detected.add(label)

    return jsonify({"objects": list(detected)})


# =========================
# VIDEO ANALYSIS (YOLO + CLIP)
# =========================
@app.route("/analyze-video", methods=["POST"])
def analyze_video():
    try:
        video_path = request.json["video_path"]
        video_path = ensure_h264(video_path)

        cap = cv2.VideoCapture(video_path)
        detections = []
        clip_embeddings = []
        frame_count = 0
        fps = cap.get(cv2.CAP_PROP_FPS) or 30

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_count % int(fps) == 0:
                timestamp = frame_count / fps

                results = yolo_model(frame)
                for r in results:
                    for box in r.boxes:
                        label = yolo_model.names[int(box.cls[0])]
                        detections.append({"label": label, "timestamp": timestamp})

                image_tensor = preprocess(
                    Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                ).unsqueeze(0).to(device)

                with torch.no_grad():
                    emb = clip_model.encode_image(image_tensor)
                    emb = emb / emb.norm(dim=-1, keepdim=True)

                clip_embeddings.append(emb[0].cpu().numpy())

            frame_count += 1

        cap.release()

        avg_embedding = None
        if clip_embeddings:
            avg_embedding = np.mean(clip_embeddings, axis=0).tolist()

        return jsonify({
            "detections": detections,
            "clip_embedding": avg_embedding
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =========================
# ACTION DETECTION (SlowFast)
# Sliding window over full video — picks most forensically relevant segment
# =========================
@app.route("/action-detect", methods=["POST"])
def action_detect():
    try:
        file = request.files.get("file")
        top_n = int(request.form.get("top_n", 5))

        if not file:
            return jsonify({"error": "No file provided"}), 400

        path = "temp_action.mp4"
        file.save(path)
        path = ensure_h264(path)

        windows = get_video_windows(path, window_duration=CLIP_DURATION, overlap=0.5)

        best_results = None
        best_score = -1
        best_window_start_s = 0.0

        for (start_sec, end_sec) in windows:
            # Load clip using pytorchvideo EncodedVideo
            video = EncodedVideo.from_path(path)
            video_data = video.get_clip(start_sec=start_sec, end_sec=end_sec)
            video_data = slowfast_transform(video_data)

            # Move both pathways to device
            inputs = [i.to(device)[None, ...] for i in video_data["video"]]

            with torch.no_grad():
                preds = slowfast_model(inputs)

            post_act = torch.nn.Softmax(dim=1)
            probs = post_act(preds)[0]

            top_probs, top_indices = torch.topk(probs, k=min(top_n, probs.shape[0]))

            window_results = []
            for prob, idx in zip(top_probs.tolist(), top_indices.tolist()):
                raw_label = kinetics_id_to_classname.get(int(idx), f"class_{idx}")
                window_results.append({
                    "rank":         len(window_results) + 1,
                    "raw_label":    raw_label,
                    "forensic_tag": get_forensic_tag(raw_label),
                    "confidence":   round(prob, 4),
                })

            ws = score_window(window_results)
            print(f"[DEBUG] window {start_sec:.1f}-{end_sec:.1f}s: score={ws:.4f} "
                  f"top1=({window_results[0]['raw_label']}, {window_results[0]['confidence']})")

            if ws > best_score:
                best_score = ws
                best_results = window_results
                best_window_start_s = start_sec

        print(f"[DEBUG] Best window at {best_window_start_s:.1f}s — "
              f"Top-{top_n}: {[(r['raw_label'], r['confidence']) for r in best_results]}")

        return jsonify({
            "model_used":          "slowfast_r50-kinetics400",
            "top_actions":         best_results,
            "action":              best_results[0]["forensic_tag"],
            "raw_label":           best_results[0]["raw_label"],
            "confidence":          best_results[0]["confidence"],
            "best_window_start_s": round(best_window_start_s, 1),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =========================
# ROOT
# =========================
@app.route("/")
def home():
    return "AI service running (SlowFast R50 Kinetics-400 + CLIP + YOLO)"


if __name__ == "__main__":
    app.run(port=8000)