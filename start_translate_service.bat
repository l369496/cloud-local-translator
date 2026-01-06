@echo off
title Local M2M100 Translation Service
echo Starting local translation service...
python -m uvicorn translate_server:app --host 0.0.0.0 --port 8000 --log-level "warning"
pause
