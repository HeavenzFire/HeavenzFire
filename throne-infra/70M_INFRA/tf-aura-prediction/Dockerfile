FROM tensorflow/tensorflow:latest-gpu

# 144Hz Aura prediction model for glyph auto-scale
COPY aura_model.py /app/
COPY requirements.txt /app/

WORKDIR /app
RUN pip install -r requirements.txt

CMD ["python", "aura_model.py", "--harmonic-forecast", "528Hz"]
