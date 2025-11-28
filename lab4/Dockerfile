FROM python:3.10-slim

WORKDIR /app

COPY src/app.py /app/

RUN pip install flask requests

EXPOSE 5000

CMD ["python", "app.py"]