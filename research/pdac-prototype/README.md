# HeavenzFire PDAC Research Prototype

**Version:** 0.1.0 · **Status:** research scaffold; not clinically validated.

## Purpose
Reproducible toy model for pancreatic ductal adenocarcinoma (PDAC) tumor-growth and treatment-response simulation. Default coefficients are **synthetic software-test parameters**, not fitted biological estimates. Output is not a patient-specific prediction, treatment recommendation, or evidence of efficacy.

## Model
Two normalized compartments: sensitive burden S and resistant burden R.

- dS/dt = rS·S·(1 − (S+R)/K) − kS·u(t)·S − μS
- dR/dt = rR·R·(1 − (S+R)/K) − kR·u(t)·R + μS

The fixed-step explicit Euler solver is deliberately simple. Time, burden, and exposure are arbitrary units. The model omits pharmacokinetics, dose/toxicity, stroma, immune response, spatial invasion, metastasis, and patient heterogeneity.

## Run
Python 3.10+; standard library only.

```bash
python research/pdac-prototype/run_simulation.py --days 120 --dt 0.1 --treatment on --out results
python research/pdac-prototype/run_simulation.py --days 120 --dt 0.1 --treatment none --out results-control
python -m unittest discover -s research/pdac-prototype/tests -v
```

Outputs are a CSV trajectory and JSON summary, including a synthetic untreated comparator.

## Candidate evidence and code
- NCI/GDC Pancreatic Cancer Organoid Profiling: https://registry.opendata.aws/organoid-pancreatic/ and https://portal.gdc.cancer.gov/projects/ORGANOID-PANCREATIC (check file-level access; some data are controlled).
- GEO GSE235548: https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE235548
- Candidate organoid analysis code: https://github.com/amssyqy/Pancreatic-cancer-organoids/tree/v1.0.0
- AACR Figshare supplementary data candidate: https://aacr.figshare.com/articles/dataset/Supplementary_Data_from_Organoid_Sensitivity_Correlates_with_Therapeutic_Response_in_Patients_with_Pancreatic_Cancer/22484096

These are candidate sources only. No external dataset has been downloaded, ingested, or validated by this commit. Before reuse, verify current availability, license/access, metadata, measured endpoints, and provenance.

## Validation gates
1. Software tests: limiting case, deterministic repeat, finite/non-negative states, input rejection, treatment/control behavior under synthetic parameters.
2. Numerical analysis: compare step sizes and assess solver error.
3. Biological calibration: predefine an observable endpoint; record source accession/version and SHA-256; fit only training data.
4. Holdout: split by patient/organoid (not replicate wells); compare mean/median and regularized regression baselines; report MAE/RMSE or pre-specified AUROC/AUPRC, uncertainty, calibration, and external validation if possible.

Passing software tests does not establish biological or clinical validity. Do not claim a cure or clinical benefit without independent experimental and clinical evidence.
