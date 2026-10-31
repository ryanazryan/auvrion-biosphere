# Experimental, optional CPU worker. Build only on a machine with enough RAM/disk.
# Based on the already-existing workers/perch2/server.py.
FROM python:3.11-slim-bookworm
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TF_CPP_MIN_LOG_LEVEL=2
RUN python -m pip install --no-cache-dir \
    "bioacoustics-model-zoo[perch]==0.13.4" \
    "tensorflow-cpu>=2.20,<2.22" \
    "kagglehub>=0.3" \
    "scipy>=1.11"
RUN mkdir -p /tmp/perch-home/.cache && chown -R 65532:65532 /tmp/perch-home
WORKDIR /worker
COPY workers/perch2/server.py /worker/server.py
USER 65532:65532
CMD ["python", "/worker/server.py"]
