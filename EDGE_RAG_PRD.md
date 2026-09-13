# EdgeRAG Product Requirements Document

## Executive Summary

EdgeRAG is a fully local technical knowledge assistant and local LLM benchmarking platform for engineering teams. It processes English text PDFs, retrieves relevant passages, generates grounded answers through Ollama, and compares local models using reproducible quality, latency, and hardware measurements.

## Problem

Engineering information is distributed across manuals, SOPs, troubleshooting guides, maintenance procedures, reports, and system documentation. Manual searching is slow. Cloud LLM services can introduce privacy concerns, recurring costs, internet dependency, and limited deployment control.

## Target Users

- Engineers and technicians searching technical information.
- R&D, AI, and IT engineers evaluating local models.
- Recruiters and interviewers assessing practical AI and software engineering skills.

## Value Proposition

- Ask technical questions against local documents.
- Inspect supporting passages and PDF page references.
- Keep documents, embeddings, and inference on the local machine.
- Compare models using the same questions, context, settings, and hardware.

## Objectives

1. Process technical PDFs locally.
2. Generate local embeddings and FAISS indexes.
3. Retrieve relevant passages and generate source-backed answers.
4. Support at least two Ollama models through one provider abstraction.
5. Store benchmark runs and display comparable results.
6. Work offline after dependencies and models are downloaded.
7. Demonstrate practical AI/ML, backend, frontend, testing, and measurement skills.

## MVP Scope

- English PDFs containing selectable text.
- Upload, processing status, listing, inspection, duplicate detection, and deletion.
- Standalone questions against all ready documents.
- Model selection, streamed answers, source passages, and insufficient-information responses.
- Benchmark suites, history, comparisons, raw trial results, and manual quality reviews.
- Default limits: 25 MB and 300 pages per PDF; 50 documents and 10,000 chunks per workspace.

## Non-Goals

- Cloud inference, paid APIs, cloud hosting, Kubernetes, microservices, authentication, and multi-tenancy.
- Agents, tool execution, fine-tuning, conversation memory, and production-scale infrastructure.
- OCR, multilingual evaluation, image understanding, and reliable table reconstruction.

## User Experience

### Document Workspace

Upload PDFs and inspect queued, processing, ready, warning, or failed states.

### Knowledge Assistant

Select a model, ask a question, read the streamed answer, and expand source cards showing filename, page, and passage text.

### Benchmark Dashboard

Select models and a fixed question suite, run comparisons, inspect quality reviews, and compare retrieval, generation, latency, throughput, CPU, RAM, GPU, and VRAM metrics.

### Five-Minute Demo

Upload a fictional technical manual, ask a supported question, inspect its source, ask an unsupported question to show abstention, switch models, and open benchmark results.

## Functional Requirements

- Validate file type, size, page count, encryption, and usable extracted text.
- Preserve stable document IDs, chunk IDs, physical PDF page numbers, and SHA-256 hashes.
- Discover installed Ollama models dynamically.
- Validate generated citation identifiers against retrieved passages.
- Record benchmark configuration, model digests, answers, timings, resource samples, failures, and quality reviews.
- Allow cancellation between benchmark trials.
- Retain clear processing and recovery states across application restarts.

## Quality Attributes

- **Privacy:** document content never reaches external AI APIs.
- **Cost:** no paid runtime services; target RM0 software cost.
- **Offline capability:** normal operation works without internet after setup.
- **Maintainability:** modular monolith, explicit boundaries, minimal dependencies.
- **Reproducibility:** locked dependencies, model revisions/digests, corpus hashes, prompt versions, and recorded settings.
- **Interview defensibility:** architecture and measurements are simple enough to explain clearly.

## Acceptance Targets

- Top-5 evidence hit rate at least 90% on the answerable acceptance set.
- At least 80% of answerable responses from the selected default model are fully grounded and useful under the written rubric.
- At least 4 of 5 unsupported questions are correctly declined.
- Both supported models have published benchmark results, including misses and unavailable metrics.

## Public Demo Corpus

Use three authored fictional technical documents with known answers and supporting pages. Commit only synthetic fixtures and approved benchmark evidence to GitHub. Keep personal or proprietary PDFs outside the repository.

## Product Roadmap

Post-MVP work may add OCR, multilingual embeddings, hybrid BM25 retrieval, reranking, conversation history, collections, PDF highlighting, broader quantization studies, and licensed real-manual evaluation.

