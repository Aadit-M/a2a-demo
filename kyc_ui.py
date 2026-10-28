import uvicorn


if __name__ == "__main__":
    print("Starting the KYC architecture demo at http://127.0.0.1:8002")
    uvicorn.run("kyc_backend:app", host="127.0.0.1", port=8002, reload=False)
