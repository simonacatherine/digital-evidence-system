import torch
import open_clip
from PIL import Image
from flask import Flask, request, jsonify
from ultralytics import YOLO
from sentence_transformers import SentenceTransformer
import numpy as np
import cv2

yolo_model = YOLO("yolov8m.pt")
app = Flask(__name__)

# device setup
device = "cuda" if torch.cuda.is_available() else "cpu"

# load clip model for images 
clip_model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-B-32",
    pretrained="laion2b_s34b_b79k"
)

clip_model = clip_model.to(device)
clip_model.eval()

clip_tokenizer = open_clip.get_tokenizer("ViT-B-32")

# load sentence transformer for docs
text_model = SentenceTransformer("all-MiniLM-L6-v2", device=device)

print("Models loaded successfully.")
print("Running on device:", device)

# image embedding
@app.route("/embed-image", methods=["POST"])
def embed_image():
    try:
        image_path = request.json["image_path"]

        image = preprocess(Image.open(image_path).convert("RGB")).unsqueeze(0)
        image = image.to(device)

        with torch.no_grad():
            image_features = clip_model.encode_image(image)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

        embedding = image_features[0].cpu().tolist()

        return jsonify({"embedding": embedding})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# short text embedding for image search
@app.route("/embed-text-clip", methods=["POST"])
def embed_text_clip():
    try:
        text = request.json["text"]

        tokens = clip_tokenizer([text]).to(device)

        with torch.no_grad():
            text_features = clip_model.encode_text(tokens)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

        embedding = text_features[0].cpu().tolist()

        return jsonify({"embedding": embedding})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# document embedding
@app.route("/embed-document", methods=["POST"])
def embed_document():
    try:
        text = request.json["text"]

        # SentenceTransformer handles normalization internally
        embedding = text_model.encode(
            text,
            normalize_embeddings=True
        )

        return jsonify({"embedding": embedding.tolist()})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# yolo
@app.route("/detect-objects", methods=["POST"])
def detect_objects():

    image_path = request.json["image_path"]

    results = yolo_model(image_path, conf=0.25)

    detected = set()

    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            label = yolo_model.names[cls_id]
            detected.add(label)

    return jsonify({
        "objects": list(detected)
    })

import subprocess
import os

def ensure_h264(video_path):
    output_path = video_path + "_h264.mp4"

    # If already converted, reuse
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

    print("Converting:", video_path)

    return output_path

# video with YOLO + CLIP embedding
@app.route("/analyze-video", methods=["POST"])
def analyze_video():
    try:
        video_path = request.json["video_path"]

        converted_path = ensure_h264(video_path)
        cap = cv2.VideoCapture(converted_path)
        if not cap.isOpened():
         return jsonify({"error": "Video failed to open"}), 500

        fps = cap.get(cv2.CAP_PROP_FPS)

        if fps is None or fps <= 0:
            fps = 30  # assume 30 FPS if unknown

        frame_interval = max(int(fps), 1)  # 1 frame per second

        frame_count = 0
        detections = []
        clip_embeddings = []

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_count % frame_interval == 0:
                timestamp = frame_count / fps

                # yolo detection
                results = yolo_model(frame)

                for r in results:
                    for box in r.boxes:
                        cls_id = int(box.cls[0])
                        label = yolo_model.names[cls_id]
                        conf = float(box.conf[0])

                        detections.append({
                            "label": label,
                            "timestamp": timestamp,
                            "confidence": conf
                        })

                # clip embedding
                image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_image = Image.fromarray(image_rgb)

                image_tensor = preprocess(pil_image).unsqueeze(0).to(device)

                with torch.no_grad():
                    image_features = clip_model.encode_image(image_tensor)
                    image_features = image_features / image_features.norm(dim=-1, keepdim=True)

                clip_embeddings.append(image_features[0].cpu().numpy())

            frame_count += 1

        cap.release()

        # avg clip embeddings
        if len(clip_embeddings) > 0:
            avg_embedding = np.mean(clip_embeddings, axis=0)

            # Normalize again after averaging
            norm = np.linalg.norm(avg_embedding)
            if norm > 0:
                avg_embedding = avg_embedding / norm

            avg_embedding = avg_embedding.tolist()
        else:
            avg_embedding = None

        return jsonify({
            "detections": detections,
            "clip_embedding": avg_embedding
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/")
def home():
    return "AI service running (CLIP + SentenceTransformer)"

if __name__ == "__main__":
    app.run(port=8000)
