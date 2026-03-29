# 🚀 Smart Job Tracker with AI Insights

A full-stack web application that helps users track job applications, upload resumes, and analyze skill gaps using AI.

---

## ✨ Features

### 📌 Job Application Tracker
- Create, edit, delete job applications
- Track status: Applied, Screening, Interview, Offer, Rejected, Ghosted, Withdrawn
- Store company, role, job description, salary, contacts, and notes

---

### 📄 Resume Upload (AWS S3)
- Secure PDF upload using presigned URLs
- View/download resumes via temporary links
- Replace/update resume anytime

---

### 🤖 AI Resume Analysis
- Extract text from uploaded resume (PDF)
- Compare resume with job description using AI
- Generate:
  - Match Score (0–100%)
  - Required Skills
  - Missing Skills
  - Improvement Suggestions

---

### 📊 Analytics (Extendable)
- Track application success rate
- Monitor interview ratio
- Analyze job search progress

---

## 🧠 Tech Stack

Frontend:
- React
- TypeScript
- Custom CSS (scalable UI system)

Backend:
- Node.js
- Express.js
- Supabase (PostgreSQL)

AI:
- OpenAI API (gpt-4o-mini)

Storage:
- AWS S3 (presigned upload/download)

Infra:
- Terraform

---

## 🏗️ Architecture

Frontend (React)
        ↓
Backend (Node.js + Express)
        ↓
 ┌───────────────┬───────────────┐
 │               │               │
Supabase     AWS S3         OpenAI API
(Database)   (Resumes)      (AI Analysis)

---

## 🔄 Flow

1. Create Application  
2. Upload Resume → stored in S3  
3. Extract Resume Text (pdf-parse)  
4. Send Resume + Job Description → OpenAI  
5. Store AI results in database  
6. Display analysis in UI  

---

## 📦 Installation

### Clone repo
git clone https://github.com/your-username/smart-job-tracker.git
cd smart-job-tracker

---

### Backend Setup
cd server
npm install

Create `.env`:

PORT=5000
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
AWS_REGION=your_region
AWS_S3_RESUME_BUCKET=your_bucket
OPENAI_API_KEY=your_openai_key

Run backend:
npm run dev

---

### Frontend Setup
cd client
npm install
npm run dev

---

### Terraform (S3 setup)
cd infra/terraform
terraform init
terraform apply

---

## 🔐 Environment Variables

SUPABASE_URL  
SUPABASE_SERVICE_ROLE_KEY  
AWS_REGION  
AWS_S3_RESUME_BUCKET  
OPENAI_API_KEY  

---

## 💰 Cost

- Uses GPT-4o-mini (low cost)
- ~$0.001–0.01 per analysis
- Recommend setting usage limits in OpenAI dashboard

---

## 🧪 API Endpoints

Applications:
POST /api/applications  
GET /api/applications  
PATCH /api/applications/:id  
DELETE /api/applications/:id  

Resume:
POST /api/resumes/presign-upload  
POST /api/resumes/complete-upload  
POST /api/resumes/presign-download  
POST /api/resumes/extract-text  

AI:
POST /api/ai-analysis/analyze-resume-job-match  

---

## 🚀 Future Improvements

- Resume scoring visualization chart
- AI resume rewriting
- Job reminders
- Multi-resume comparison
- Advanced analytics dashboard

---

## 🧠 Key Learnings

- Secure file uploads with presigned URLs
- AI integration in real-world apps
- Full-stack + cloud architecture
- Cost optimization for AI APIs

---

## 👨‍💻 Author

Harsh Hirpara  
Full-Stack Developer | Cloud & AI Enthusiast

---

## ⭐ Support

If you like this project, give it a ⭐ on GitHub!

---

## 📄 License

MIT License

---

## 🧾 Resume Line

Built an AI-powered job tracking platform using React, Node.js, PostgreSQL, AWS S3, and OpenAI, enabling resume analysis, skill gap detection, and application analytics.