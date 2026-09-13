# EdgeRAG Implementation Plan

## Summary

Build a local modular monolith with React, FastAPI, Sentence Transformers, FAISS, SQLite, and native Ollama. Target the current Windows PC profile: Ryzen 5 5600X and RTX 3070 with 8 GB VRAM. System RAM must be measured during foundation work. Ollama is reachable but currently has no installed models.

## Technology and Architecture

- Python 3.11, FastAPI, Uvicorn, Pydantic settings, httpx.
- pypdf for page-level text extraction.
- `sentence-transformers/all-MiniLM-L6-v2`, pinned to a local revision, CPU PyTorch.
- 220 embedding-token chunks with 40-token overlap; preserve page boundaries and assert the 256-token model limit is respected.
- Normalized float32 vectors in `IndexIDMap2(IndexFlatIP)`; default Top-K 5, configurable from 1 to 10.
- Native Ollama provider behind a small interface for discovery, metadata, streaming generation, and residency checks.
- SQLite with foreign keys, WAL, versioned migrations, and authoritative chunk metadata. FAISS remains rebuildable.
- React, TypeScript, Vite, Recharts, one typed API client, component state, and small hooks.

## Backend Modules

- `api`: validation, status codes, SSE streaming, and REST handlers.
- `documents` and `ingestion`: files, extraction, cleaning, chunking, and processing states.
- `embeddings` and `vector_store`: model loading, encoding, indexing, persistence, and fingerprints.
- `retrieval` and `rag`: search, context construction, prompting, and citation validation.
- `providers`: Ollama transport and model metadata.
- `benchmarks` and `monitoring`: trial scheduling, timing, resource sampling, and aggregation.
- `persistence` and `core`: SQLite repositories, settings, locks, and recovery.

Use one background executor and one application operation lock. Serialize ingestion, deletion, generation, and benchmarks. Mark unfinished jobs interrupted after restart.

## REST API (`/api/v1`)

- `GET /health`
- `POST /documents`
- `GET /documents`
- `GET /documents/{id}`
- `DELETE /documents/{id}`
- `POST /retrieval`
- `POST /rag/ask`
- `GET /models`
- `GET /benchmarks/suites`
- `POST /benchmarks`
- `GET /benchmarks`
- `GET /benchmarks/{id}`
- `POST /benchmarks/{id}/cancel`
- `PUT /benchmarks/{id}/reviews/{trial_id}`
- `DELETE /benchmarks/{id}`

Stream answer fragments, sources, completion metadata, and errors through SSE. Do not expose arbitrary Ollama request passthrough.

## Ingestion and RAG

1. Validate upload and hash it.
2. Extract each PDF page independently with pypdf.
3. Normalize whitespace while preserving technical identifiers, numbers, units, and paragraphs.
4. Chunk, embed, normalize, and write page/chunk metadata.
5. Publish a FAISS snapshot atomically and mark the document ready.
6. Embed a question, retrieve five passages, construct `[S1]`-style context, and call the selected Ollama model.

The prompt requires use of supplied context, factual citations, preserved units, conflict reporting, and an explicit insufficient-information response. Treat document instructions as untrusted content. Validate citations server-side.

## Data Persistence

Store documents, chunks, index metadata, benchmark runs, trials, resource samples, and manual quality reviews. Save model tags/digests, corpus and context hashes, prompt versions, settings, hardware/software snapshots, and raw provider metrics. Check database/index fingerprints at startup and rebuild from SQLite when inconsistent.

## Benchmark Methodology

Separate retrieval, fixed-context generation, and end-to-end RAG results.

1. Freeze corpus hashes, index revision, question suite, context ordering, prompt version, settings, and model digests.
2. Precompute identical context for model comparisons and retain its hash.
3. Run models sequentially with no competing application work.
4. Exclude one warm-up request, then run three warm repetitions per question.
5. Alternate model order and record the question-order seed.
6. Unload models before cold trials and verify they are absent from Ollama’s running-model list. Label these trials “model-unloaded”; operating-system caches may remain warm.
7. Retain all raw trials, failures, and missing measurements.

Measure retrieval latency, observed first nonempty fragment latency, generation latency, Ollama `load_duration`, `eval_duration`, `eval_count`, prompt counts, output tokens/second, total response latency, CPU, RAM, GPU, and VRAM. Preserve nanosecond source values and derive throughput without division by zero. Report count, mean, median, standard deviation, failures, and per-question results. Never collapse quality and speed into one winner score.

## Hardware Monitoring

Sample every 500 ms starting two seconds before generation. Record host CPU/RAM, backend RSS, accessible Ollama process-tree CPU/RSS, device-wide GPU utilization, and VRAM. Discard the initial psutil CPU sample. Label unavailable Windows WDDM per-process GPU memory as null with a reason. Observed memory is not a minimum hardware requirement.

## Testing and Evaluation

- Unit-test chunking, metadata, retrieval, deterministic IDs, metrics, and CPU normalization.
- Integration-test ingestion, FAISS retrieval, provider streaming, persistence, recovery, and API flows.
- Browser-test upload, model switching, sources, and benchmark history.
- Use three fictional documents, ten development questions, and a separate 20-question acceptance set containing 15 answerable and 5 unsupported questions.
- Add prompt-injection fixtures and manually score groundedness/usefulness from 0–2.
- Use fake providers in CI and real Ollama checks locally.

## Deployment and Configuration

Develop natively on Windows for reliable GPU and host monitoring. Keep Ollama native. Optionally package React assets with FastAPI in Docker and connect to host Ollama through `host.docker.internal`. Mount data and embedding caches. Bind services to loopback. Use typed environment settings for storage, Ollama URL, embedding revision, chunking, Top-K, generation limits, timeouts, and capacity limits. Enable offline Hugging Face mode and disable telemetry after model download.

## Development Phases and Order

1. Foundation: runtime verification, dependency lock, settings, database, health endpoint.
2. Retrieval: one PDF through extraction, chunking, embedding, FAISS, persistence, reload, and deletion.
3. Assistant: streamed Ollama answer, sources, abstention, and second model.
4. Frontend: Documents, Assistant, and Benchmarks pages.
5. Benchmarking: one measured trial, then repetitions, cold/warm controls, monitoring, and history.
6. Evaluation and release: quality review, acceptance set, offline smoke test, Docker smoke test, README, screenshots, and demo video.

## GitHub Milestones

- M1: local foundation.
- M2: searchable persistent documents.
- M3: grounded assistant with two models.
- M4: reproducible benchmark evidence.
- M5: evaluated portfolio release.

## Execution Methodology: Model Roles and Skills

### Model Routing

- Primary parent/lead: `gpt-5.6-sol` with `xhigh` reasoning for all planning, architecture, shared interfaces, integration, and acceptance decisions.
- Execution workers: `gpt-5.6-luna` with `max` reasoning for bounded implementation, testing, and debugging.
- Use the `delegate-work` skill for every delegated package.
- Do not escalate to Astra unless Luna Max and a focused Sol Medium diagnostic attempt both fail on the same concrete blocker.
- Astra involvement, if ever eligible, stays limited to that blocker. Sol retains architecture and integration ownership.

### Work Package Contract

Every Luna package must state:

- `ROUTE`: GPT-5.6 Luna / max.
- `GOAL`: one observable outcome.
- `CONTEXT`: only required repository and product facts.
- `SCOPE`: owned files or behavior.
- `CONSTRAINTS`: interfaces, invariants, and exclusions.
- `DONE WHEN`: observable acceptance conditions.
- `VALIDATION`: focused checks that materially prove completion.
- `RETURN`: changed files, behavior, verification, and remaining risk/blocker.

Sol identifies ownership before delegation, keeps shared schemas and dependency files under parent control, and integrates only after inspecting worker changes.

### Lean-Build Rules

Apply `lean-build` to every package:

- Build the smallest complete end-to-end behavior that satisfies acceptance.
- Preserve modular monolith scope.
- Reuse existing seams before adding abstractions.
- Add dependencies, services, configuration, or migrations only when acceptance requires them.
- Move optional extensibility and polish to Post-MVP.
- Run focused proof and stop when acceptance passes.

### Compressed Communication

Apply `caveman` and `cavecrew` principles to worker and review output to reduce context usage:

- Investigation: path, line, symbol, short finding.
- Implementation: changed files, behavior, verification.
- Review: location, severity, problem, fix.
- Blocker: exact failure, attempted fixes, evidence, next step.

Preserve exact identifiers, errors, units, and test results. Summarize logs instead of dumping them. Use normal prose whenever compression could create ambiguity. Keep committed documentation and code comments in normal English.

### Parallelism and Escalation

- Start with one worker; parallelize only independent packages.
- Use at most three simultaneous workers, leaving a slot for Sol.
- Give workers exclusive write ownership.
- Do not create user-facing threads for implementation subtasks.
- If Luna fails, first narrow or clarify the package. Then let Sol inspect and repair or run a focused Sol Medium diagnostic. Do not repeat identical failed attempts.
- Missing permissions, dependencies, credentials, or hardware require the relevant remedy, not a larger model.

## MVP Completion Checklist

- [x] Local PDF processing and page metadata work.
- [x] Persistence, deletion, and recovery work.
- [x] Two models use one provider interface.
- [x] Sources and citation validation work.
- [x] Unsupported questions are evaluated.
- [x] Benchmark modes and metrics remain separate.
- [x] Raw evidence and reproducibility metadata are retained.
- [x] Missing metrics are labeled accurately.
- [x] Automated tests and real-provider checks pass.
- [x] Offline and Docker smoke tests pass.
- [x] README enables reproduction.
- [x] Five-minute demo is ready.
- [x] Sol verifies integrated milestone acceptance.

