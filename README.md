# Expressjs-Baileys-Whatsapp-Api-Unofficial

## Description

Expressjs-Baileys is an implementation of [Baileys](https://github.com/WhiskeySockets/Baileys) using express.js, allowing Baileys to be used as a REST API. By using Baileys, you can set up your own WhatsApp API server.  This project includes the main feature of supporting multiple accounts, enabling users to log in with more than one WhatsApp account.

## Features

- ✅ Multiple Account
- ✅ QR Code Generator
- ✅ Send Image Message (support for other file types will follow)
- ✅ Logout Request

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
2. To check connection status, send a GET request to `/get-state?cred_id=xxx`.
3. To get a login QR code, send a GET request to `/get-qrcode?cred_id=xxx`.
4. To log out, send a GET request to `/logout?cred_id=xxx`.
5. To send a text message, send a POST request to `/send-text-message?cred_id=xxx` with the following JSON body:
    ```json
    {
        "phone_number": "62823xxxxxxx",
        "message": "ini pesan multimedia sukses"
    }
    ```
6. To send an image message, send a POST request to `/send-media-message?cred_id=xxx` with the following JSON body:
    ```json
    {
        "phone_number": "62823xxxxxxx",
        "media_filename": "your-image-name-with-extension",
        "media": "your-image-https-url",
        "message": "non mandatory"
    }
    ```
## Additional
To remove old temporary files, set up a cron job to periodically call the endpoint below:

```
[GET] /delete-temp-files?cred_id=xxx
```

## License

This project is licensed under the MIT License.

---

## 🌍 FreePalestine 🇵🇸

We stand in solidarity with the people of Palestine. Let's work together towards peace, justice, and freedom for all. #FreePalestine