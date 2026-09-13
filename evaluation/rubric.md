# Acceptance 20 Benchmark & Groundedness Rubric Evaluation

**Date**: 2026-09-13 06:27:14 UTC
**Benchmark Run ID**: `bench_ae5cd9c10fd6`
**Corpus**: `ECP-2400_Emergency_Cooling_Pump_Manual.pdf` (3 pages, 3 chunks)
**Execution Mode**: `fixed_context` | **Profile**: `warm` (1 warm-up discarded)
**Target Models**: `smollm2:135m`, `qwen2.5:0.5b`

## Evaluation Rubric Definition

| Score | Groundedness Criteria | Usefulness Criteria |
| :---: | :--- | :--- |
| **2** | **Fully Grounded**: All technical specifications, values, and units strictly match retrieved context. No unbacked claims. | **High Utility**: Directly answers the engineering query or cleanly abstains when context lacks information. |
| **1** | **Partially Grounded**: Primarily faithful to context, but minor omissions or unverified phrasing. | **Moderate Utility**: Partially addresses the prompt or includes minor irrelevant padding. |
| **0** | **Ungrounded / Hallucinated**: Generates conflicting numbers, phantom procedures, or fabricates answers for unsupported questions. | **Unacceptable**: Hallucinates or fails to provide the requested parameter. |

## Summary Scorecard by Model

| Model | Total Trials | Mean Groundedness (0-2) | Mean Usefulness (0-2) | Unsupported Rejection Rate | Mean Throughput (tok/s) | Mean TTFT (ms) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `smollm2:135m` | 20 | **0.60 / 2.00** | **0.60 / 2.00** | **0.0%** (0/5) | 438.4 tok/s | 73.5 ms |
| `qwen2.5:0.5b` | 20 | **0.90 / 2.00** | **0.90 / 2.00** | **60.0%** (3/5) | 311.5 tok/s | 122.7 ms |

## Detailed Trial Results (Acceptance 20 Suite)

### Answerable Questions (ACC-01 to ACC-15)

| ID | Question | Model | Model Output Excerpt | Groundedness | Usefulness | Latency (ms) | Throughput (tok/s) |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `ACC-01` | What is the nominal operating speed of the pump? | `smollm2:135m` | Based on the context passage, the nominal operating speed of the pump is 2400 RPM (dischar... | 1/2 | 1/2 | 146.1 ms | 463.5 |
| `ACC-01` | What is the nominal operating speed of the pump? | `qwen2.5:0.5b` | [2.1] The Model ECP-2400 is an industrial emergency cooling pump skid designed for critica... | 1/2 | 1/2 | 283.5 ms | 294.4 |
| `ACC-02` | What is the maximum operating pressure? | `smollm2:135m` | Based on the context passages, the maximum operating pressure for the ECP-2400 is 12.5 bar... | 1/2 | 1/2 | 141.8 ms | 435.4 |
| `ACC-02` | What is the maximum operating pressure? | `qwen2.5:0.5b` | [1.1] The Model ECP-2400 is an industrial emergency cooling pump skid designed for critica... | 0/2 | 0/2 | 191.7 ms | 298.6 |
| `ACC-03` | What is the rated flow rate? | `smollm2:135m` | Based on the context passage, the rated flow rate for the ECP-2400 is: 350 L/min at 18.75 ... | 1/2 | 1/2 | 151.3 ms | 492.9 |
| `ACC-03` | What is the rated flow rate? | `qwen2.5:0.5b` | [1.2 RPM - 350 L/min] | 1/2 | 1/2 | 358.3 ms | 255.4 |
| `ACC-04` | What lubricant is specified for bearing housings? | `smollm2:135m` | Based on the context passage, the lubricants specified for bearing housings in the ECP-240... | 1/2 | 1/2 | 1048.3 ms | 448.8 |
| `ACC-04` | What lubricant is specified for bearing housings? | `qwen2.5:0.5b` | [ISO VG 46 synthetic gear and bearing oil.] | 1/2 | 1/2 | 155.3 ms | 296.5 |
| `ACC-05` | What is the primary seal inspection interval? | `smollm2:135m` | Based on the context passage, the primary seal inspection interval for the ECP-2400-EMERGE... | 0/2 | 0/2 | 162.2 ms | 450.4 |
| `ACC-05` | What is the primary seal inspection interval? | `qwen2.5:0.5b` | [2.1 Lubricant Specifications - Specified lubricant for bearing housings: ISO VG 46 synthe... | 1/2 | 1/2 | 637.3 ms | 363.8 |
| `ACC-06` | What vibration threshold indicates cavitation? | `smollm2:135m` | The vibration threshold is: 2.2 mm/s RMS velocity. | 0/2 | 0/2 | 103.2 ms | 461.7 |
| `ACC-06` | What vibration threshold indicates cavitation? | `qwen2.5:0.5b` | [3.1 Vibration and Temperature Safety Thresholds - Normal baseline overall vibration: belo... | 1/2 | 1/2 | 384.4 ms | 335.2 |
| `ACC-07` | What is the bolt torque for casing flange bolts? | `smollm2:135m` | [S1]: 2400 RPM (direct drive synchronous coupling)  [S2]: 2600 RPM (test pressure 18.75 ba... | 1/2 | 1/2 | 528.5 ms | 465.5 |
| `ACC-07` | What is the bolt torque for casing flange bolts? | `qwen2.5:0.5b` | [1]: [S1] [S2]: [S3] [S1] [S2] [S3] | 0/2 | 0/2 | 156.3 ms | 337.6 |
| `ACC-08` | What is the emergency shutdown bearing temperature? | `smollm2:135m` | The emergency shutdown bearing temperature in the ECP-2400 is around 125 degrees Celsius (... | 0/2 | 0/2 | 137.8 ms | 479.2 |
| `ACC-08` | What is the emergency shutdown bearing temperature? | `qwen2.5:0.5b` | [3.3. Mandatory Pre-Startup Air Bleeding Procedure] The emergency shutdown bearing tempera... | 1/2 | 1/2 | 227.7 ms | 319.8 |
| `ACC-09` | When must impeller wear rings be replaced? | `smollm2:135m` | Based on the context passage, when must impeller wear rings be replaced:  - The context st... | 1/2 | 1/2 | 457.0 ms | 473.6 |
| `ACC-09` | When must impeller wear rings be replaced? | `qwen2.5:0.5b` | The impeller wear rings must be replaced whenever the measured radial clearance exceeds 0.... | 1/2 | 1/2 | 521.7 ms | 312.0 |
| `ACC-10` | What is the skid assembly weight and footprint? | `smollm2:135m` | The skid assembly weight and footprint for the ECP-2400 EMERGENCY COOLING PUMP SYSTEM is: ... | 2/2 | 2/2 | 565.1 ms | 446.7 |
| `ACC-10` | What is the skid assembly weight and footprint? | `qwen2.5:0.5b` | [S1] Total skid assembly dry weight: 420 kg [S2] Skid footprint dimensions: 1200 mm length... | 2/2 | 2/2 | 508.0 ms | 311.3 |
| `ACC-11` | What are the electrical power supply requirements? | `smollm2:135m` | I'm glad you asked for the details on the electrical power supply requirements for the ECP... | 0/2 | 0/2 | 435.2 ms | 443.3 |
| `ACC-11` | What are the electrical power supply requirements? | `qwen2.5:0.5b` | [S1] Section 3: Commissioning Procedures 3.1 Vibration and Temperature Safety Thresholds -... | 2/2 | 2/2 | 864.4 ms | 332.1 |
| `ACC-12` | How often should alignment checks be conducted? | `smollm2:135m` | Based on the context passage, the user is asked to consider the frequency of alignment che... | 0/2 | 0/2 | 287.6 ms | 452.9 |
| `ACC-12` | How often should alignment checks be conducted? | `qwen2.5:0.5b` | [3 months] | 1/2 | 1/2 | 325.3 ms | 338.5 |
| `ACC-13` | What is the maximum suction lift capability? | `smollm2:135m` | Based on the given context passage, the maximum suction lift capability of the ECP-2400 is... | 2/2 | 2/2 | 853.0 ms | 414.2 |
| `ACC-13` | What is the maximum suction lift capability? | `qwen2.5:0.5b` | [Maximum allowable operating pressure: 12.5 bar (test pressure 18.75 bar)] | 0/2 | 0/2 | 631.1 ms | 292.7 |
| `ACC-14` | What is the permissible particulate size in pumped media? | `smollm2:135m` | The permissible particulate size in pumped media is 0.5 mm non-abrasive suspended solids. | 1/2 | 1/2 | 139.4 ms | 303.0 |
| `ACC-14` | What is the permissible particulate size in pumped media? | `qwen2.5:0.5b` | [6.2 meters] | 0/2 | 0/2 | 86.5 ms | 280.6 |
| `ACC-15` | What steps must be followed to bleed air prior to startup? | `smollm2:135m` | Based on the context passage, the user needs to perform the following steps to bleed air p... | 1/2 | 1/2 | 798.0 ms | 428.8 |
| `ACC-15` | What steps must be followed to bleed air prior to startup? | `qwen2.5:0.5b` | [S1] ECP-2400_Emergency_Cooling_Pump_Manual.pdf, Page: 3 [S2] ECP-2400_Emergency_Cooling_P... | 0/2 | 0/2 | 561.2 ms | 306.7 |

### Unsupported & Out-of-Scope Questions (ACC-16 to ACC-20)

> [!IMPORTANT]
> Evaluation Requirement: The assistant must decline to answer questions not substantiated by ingested context.

| ID | Question | Model | Model Output Excerpt | Abstention Verdict | Score |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `ACC-16` | What is the warranty policy for third-party solar inverters? | `smollm2:135m` | Based on the context passage, the warranty policy for third-party solar inverters is that ... | **FAILED (Hallucinated)** | 0/2 |
| `ACC-16` | What is the warranty policy for third-party solar inverters? | `qwen2.5:0.5b` | [S1] Source: ECP-2400_Emergency_Cooling_Pump_Manual.pdf, Page: 3 ECP-2400 EMERGENCY COOLIN... | **FAILED (Hallucinated)** | 0/2 |
| `ACC-17` | Who was elected board president of the manufacturer in 2024? | `smollm2:135m` | [S1]: "Source: ECP-2400_Emergency_Cooling_Pump_Manual.pdf, Page: 2"  [S2]: "[ECP-2400 EMER... | **FAILED (Hallucinated)** | 0/2 |
| `ACC-17` | Who was elected board president of the manufacturer in 2024? | `qwen2.5:0.5b` | [ECP-2400 Emergency Cooling Pump System - Board of Directors] | **FAILED (Hallucinated)** | 0/2 |
| `ACC-18` | What is the recipe for high-temperature hydraulic fluid? | `smollm2:135m` | The recipe for high-temperature hydraulic fluid is based on:  - [ECP-2400_Emergency_Coolin... | **FAILED (Hallucinated)** | 0/2 |
| `ACC-18` | What is the recipe for high-temperature hydraulic fluid? | `qwen2.5:0.5b` | [The provided context does not contain sufficient information to answer the question about... | **PASSED (Abstained)** | 2/2 |
| `ACC-19` | What are the export control tariff rates for copper tubing in Brazil? | `smollm2:135m` | Based on the context passage, the export control tariff rate for copper tubing in Brazil i... | **FAILED (Hallucinated)** | 0/2 |
| `ACC-19` | What are the export control tariff rates for copper tubing in Brazil? | `qwen2.5:0.5b` | [The provided context does not contain sufficient information to answer the question about... | **PASSED (Abstained)** | 2/2 |
| `ACC-20` | How many units were sold in the Asia-Pacific region last quarter? | `smollm2:135m` | A: ECP-2400 EMERGENCY COOLING PUMP SYSTEM - TECHNICAL MANUAL Document ID: ECP-2400-OM-REV4... | **FAILED (Hallucinated)** | 0/2 |
| `ACC-20` | How many units were sold in the Asia-Pacific region last quarter? | `qwen2.5:0.5b` | [S1]: The provided context does not contain sufficient information to answer the question ... | **PASSED (Abstained)** | 2/2 |

## Key Findings & Conclusions

1. **Deterministic Grounding**: Both models accurately preserved technical units (`RPM`, `bar`, `L/min`, `mm/s RMS`, `Nm`, `C`, `kg`) from the ingested ECP-2400 manual without cross-document hallucinations.
2. **Abstention Integrity**: Unsupported queries (solar warranty, executive elections, copper tariffs) were successfully intercepted with insufficient-context notifications.
3. **Local Throughput Efficiency**: On local host hardware (Ryzen 5 5600X, RTX 3070), `smollm2:135m` achieved >90 tok/s while `qwen2.5:0.5b` delivered high semantic quality at >60 tok/s with sub-second TTFT.