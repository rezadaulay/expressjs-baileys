# Expressjs-Baileys

## Description

Expressjs-Baileys is an implementation of [Baileys](https://github.com/WhiskeySockets/Baileys) using express.js, allowing Baileys to be used as a REST API. This project includes the main feature of supporting multiple accounts, enabling users to log in with more than one WhatsApp account.

## Features

- [x] Multiple Account
- [x] QR Code Generator
- [x] Send Image Message (support for other file types will follow)
- [x] Logout Request

## Installation

To install the project dependencies, run:
```bash
npm install
```

To start the development server, run:
```bash
npm run dev
```

To build the project to JavaScript, run:
```bash
npm run build
```

## Usage

1. Every request must include `cred_id`, which serves as an identifier.
2. To check connection status, send a GET request to `/get-state`.
3. To get a login QR code, send a GET request to `/get-qrcode`.
4. To log out, send a GET request to `/logout`.
5. To send a text message, send a POST request to `/send-text-message` with the following JSON body:
    ```json
    {
        "phone_number": "62823xxxxxxx",
        "message": "ini pesan multimedia sukses"
    }
    ```
6. To send an image message, send a POST request to `/send-media-message` with the following JSON body:
    ```json
    {
        "phone_number": "62823xxxxxxx",
        "media_filename": "your-image-name-with-extension",
        "media": "your-image-https-url",
        "message": "non mandatory"
    }
    ```

## License

This project is licensed under the MIT License.