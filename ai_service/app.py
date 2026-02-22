import torch
import open_clip
from PIL import Image
from flask import Flask, request, jsonify
from ultralytics import YOLO
from sentence_transformers import SentenceTransformer
import numpy as np

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

@app.route("/")
def home():
    return "AI service running (CLIP + SentenceTransformer)"

if __name__ == "__main__":
    app.run(port=8000)
