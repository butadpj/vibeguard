FROM python:3.12-slim
RUN pip install --no-cache-dir aider-chat==0.86.2
ENV TIKTOKEN_CACHE_DIR=/opt/tiktoken
RUN python -c "import tiktoken; tiktoken.get_encoding('cl100k_base'); tiktoken.get_encoding('o200k_base')"
RUN mkdir /app
COPY invoke.py /harness/invoke.py
COPY cloud_proxy.py /harness/cloud_proxy.py
# The runner supplies a non-root UID and all runtime mounts/permissions.
ENV HOME=/tmp AIDER_ANALYTICS=false AIDER_CHECK_UPDATE=false
ENV LITELLM_LOCAL_MODEL_COST_MAP=True HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
