# Blockchain-Based Digital Evidence Chain of Custody System for Cybercrime Investigations

A full-stack digital evidence management system that combines **Ethereum blockchain**, **Artificial Intelligence**, and **Geospatial Mapping** to securely manage, analyze, and verify digital evidence throughout the investigation lifecycle.

---

## Overview

Digital evidence is vulnerable to unauthorized modification and requires a legally defensible chain of custody. This project provides a unified platform for securely storing evidence, verifying integrity using blockchain, performing AI-powered forensic analysis, and visualizing evidence locations on an interactive map.

The system supports evidence management for images, videos, and documents while maintaining audit trails and role-based access control.

---

## Features

### Blockchain-Based Integrity Verification
- SHA-256 hashing for every uploaded evidence file
- Ethereum smart contract integration
- Tamper detection through blockchain verification
- Immutable chain of custody records

### AI-Powered Evidence Analysis
- YOLOv8 object detection
- VideoMAE video action recognition
- CLIP image embeddings
- Sentence Transformer document embeddings
- Natural language semantic search

### Evidence Management
- Upload and organize images, videos, and PDF documents
- Case-wise evidence organization
- Metadata management
- Evidence verification history

### Geo-Location Mapping
- Interactive Leaflet.js maps
- OpenStreetMap integration
- Nominatim geocoding
- Evidence location visualization
- Movement path reconstruction

### Security
- JWT Authentication
- Role-Based Access Control (RBAC)
- Audit logging
- Secure password hashing using bcrypt

---

## AI Models Used

| Model | Purpose |
|--------|---------|
| YOLOv8 | Object detection |
| VideoMAE | Video activity recognition |
| CLIP (ViT-B/32) | Image embeddings & semantic search |
| Sentence Transformer (all-MiniLM-L6-v2) | Document embeddings |

---

## Technology Stack

### Frontend
- HTML5
- CSS3
- JavaScript
- Leaflet.js

### Backend
- Node.js
- Express.js
- JWT Authentication
- Multer

### Database
- PostgreSQL

### AI Service
- Python
- Flask
- PyTorch
- OpenCV
- Transformers
- Sentence Transformers
- OpenCLIP

### Blockchain
- Solidity
- Ethereum
- Hardhat
- ethers.js

---

## System Architecture

```
                User
                  │
                  ▼
      Frontend (HTML/CSS/JS)
                  │
                  ▼
        Node.js + Express API
      ┌───────────┼────────────┐
      ▼           ▼            ▼
 PostgreSQL   AI Service   Ethereum
                Flask      Smart Contract
      │           │
      ▼           ▼
 Evidence    AI Analysis
 Storage
```

---

## Project Modules

- User Authentication
- Case Management
- Evidence Upload
- Blockchain Registration
- Integrity Verification
- AI-Based Evidence Analysis
- Semantic Search
- Geo-Location Mapping
- Audit Logging
- Report Generation

---

## Supported Evidence Types

| Evidence | Supported Formats |
|-----------|------------------|
| Images | JPG, JPEG, PNG |
| Videos | MP4, AVI |
| Documents | PDF |

---

## Folder Structure

```
project/
│
├── client/                 # Frontend
├── server/                 # Express Backend
├── ai_service/             # Flask AI Service
├── blockchain/             # Smart Contracts
├── database/               # SQL Scripts
├── uploads/                # Evidence Storage
├── reports/                # Generated Reports
└── README.md
```

---

## Workflow

1. User logs in
2. Creates or selects a case
3. Uploads digital evidence
4. SHA-256 hash is generated
5. Hash is registered on Ethereum
6. AI analysis is performed
7. Metadata is stored in PostgreSQL
8. Evidence becomes searchable
9. Integrity can be verified at any time
10. Evidence locations are displayed on the interactive map

---

## Dataset

Video activity recognition is based on the **UCF-Crime** dataset.

Dataset:
https://www.crcv.ucf.edu/projects/real-world/

---

## Future Enhancements

- Real-time CCTV stream analysis
- Cloud deployment
- Mobile application
- Multi-language support
- Predictive crime mapping
- Distributed evidence storage
- Advanced forensic report generation

---

## Academic Information

**Title**

Blockchain-Based Digital Evidence Chain of Custody System for Cybercrime Investigations

**Degree**

Master of Computer Applications (MCA)

**Institution**

Department of Information Science and Technology  
College of Engineering, Guindy  
Anna University, Chennai

---

## License

This project was developed for academic and research purposes.
