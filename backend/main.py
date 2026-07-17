from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from pypdf import PdfReader
import docx
import os
import uuid
import re
import numpy as np
import io
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Document Intelligence API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
sessions = {}

def extract_text_from_pdf(file_bytes):
    chunks = []
    reader = PdfReader(io.BytesIO(file_bytes))
    for page_num, page in enumerate(reader.pages, 1):
        text = page.extract_text()
        if text and text.strip():
            chunks.append({"text": text.strip(), "page": page_num, "source": "Page " + str(page_num)})
    return chunks

def extract_text_from_docx(file_bytes):
    doc = docx.Document(io.BytesIO(file_bytes))
    chunks = []
    current = []
    chunk_num = 1
    for para in doc.paragraphs:
        if para.text.strip():
            current.append(para.text.strip())
            if len(" ".join(current)) > 500:
                chunks.append({"text": " ".join(current), "page": chunk_num, "source": "Section " + str(chunk_num)})
                current = []
                chunk_num += 1
    if current:
        chunks.append({"text": " ".join(current), "page": chunk_num, "source": "Section " + str(chunk_num)})
    return chunks

def extract_text_from_txt(file_bytes):
    text = file_bytes.decode("utf-8", errors="ignore")
    words = text.split()
    chunks = []
    for i in range(0, len(words), 300):
        chunk = " ".join(words[i:i+300])
        chunk_num = i // 300 + 1
        chunks.append({"text": chunk, "page": chunk_num, "source": "Section " + str(chunk_num)})
    return chunks

def smart_chunk(chunks, max_size=500):
    result = []
    for chunk in chunks:
        text = chunk["text"]
        if len(text) <= max_size:
            result.append(chunk)
        else:
            sentences = re.split(r'(?<=[.!?])\s+', text)
            current = []
            for sentence in sentences:
                current.append(sentence)
                if len(" ".join(current)) > max_size:
                    result.append({"text": " ".join(current), "page": chunk["page"], "source": chunk["source"]})
                    current = []
            if current:
                result.append({"text": " ".join(current), "page": chunk["page"], "source": chunk["source"]})
    return result

def search_chunks(session, question, top_k=4):
    question_embedding = embedding_model.encode([question])
    embeddings = np.array(session["embeddings"])
    similarities = cosine_similarity(question_embedding, embeddings)[0]
    top_indices = np.argsort(similarities)[::-1][:top_k]
    results = []
    for idx in top_indices:
        results.append({
            "text": session["chunks"][idx]["text"],
            "source": session["chunks"][idx]["source"],
            "relevance": round(float(similarities[idx]) * 100, 1)
        })
    return results

def ask_groq(prompt):
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1024
    )
    return response.choices[0].message.content

@app.get("/health")
def health():
    return {"status": "ok", "service": "Document Intelligence API"}

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        filename = file.filename.lower()

        if filename.endswith(".pdf"):
            raw_chunks = extract_text_from_pdf(file_bytes)
        elif filename.endswith(".docx"):
            raw_chunks = extract_text_from_docx(file_bytes)
        elif filename.endswith(".txt"):
            raw_chunks = extract_text_from_txt(file_bytes)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF, DOCX, or TXT")

        if not raw_chunks:
            raise HTTPException(status_code=400, detail="Could not extract text from document")

        chunks = smart_chunk(raw_chunks)
        texts = [c["text"] for c in chunks]
        embeddings = embedding_model.encode(texts)

        session_id = str(uuid.uuid4())
        sessions[session_id] = {
            "chunks": chunks,
            "embeddings": embeddings.tolist(),
            "filename": file.filename,
            "history": []
        }

        summary_text = " ".join(texts[:5])
        summary_prompt = "Summarize this document in 2-3 sentences and list the main topics as bullet points:\n\n" + summary_text[:2000]
        summary = ask_groq(summary_prompt)

        return {
            "session_id": session_id,
            "filename": file.filename,
            "chunks_processed": len(chunks),
            "summary": summary,
            "message": "Document processed successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class QuestionRequest(BaseModel):
    session_id: str
    question: str


@app.post("/ask")
async def ask_question(req: QuestionRequest):
    try:
        if req.session_id not in sessions:
            raise HTTPException(status_code=404, detail="Session not found. Please upload a document first.")

        session = sessions[req.session_id]
        relevant_chunks = search_chunks(session, req.question)

        context = "\n\n".join(["[" + c["source"] + "]:\n" + c["text"] for c in relevant_chunks])

        history_text = ""
        if session["history"]:
            last_3 = session["history"][-3:]
            history_text = "\n".join(["Q: " + h["question"] + "\nA: " + h["answer"] for h in last_3])

        prompt = "You are an intelligent document assistant. Answer based ONLY on the document context provided.\n\n"
        prompt += "Document: " + session["filename"] + "\n\n"
        prompt += "Relevant sections from document:\n" + context + "\n\n"
        if history_text:
            prompt += "Previous conversation:\n" + history_text + "\n\n"
        prompt += "Question: " + req.question + "\n\n"
        prompt += "Instructions:\n"
        prompt += "- Answer based only on the document content\n"
        prompt += "- Cite which section or page the information comes from\n"
        prompt += "- If the answer is not in the document, say 'This information is not found in the document'\n"
        prompt += "- Be clear and concise"

        answer = ask_groq(prompt)
        session["history"].append({"question": req.question, "answer": answer})

        return {
            "answer": answer,
            "sources": relevant_chunks[:3],
            "question": req.question
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/session/{session_id}")
def delete_session(session_id: str):
    if session_id in sessions:
        del sessions[session_id]
    return {"message": "Session deleted"}


@app.get("/session/{session_id}")
def get_session(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    session = sessions[session_id]
    return {
        "filename": session["filename"],
        "chunks": len(session["chunks"]),
        "questions_asked": len(session["history"])
    }
