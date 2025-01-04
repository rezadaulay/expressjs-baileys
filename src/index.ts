import 'dotenv/config';
import express from "express";
import WaService from './services/whatsapp';
import { deleteOldTempRemoteFile } from './utils';
import cors from "cors";
import { existsSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'fs';
import QRCode from 'qrcode';
import { body, query, validationResult } from "express-validator";
import { createLogger, format, transports } from 'winston';

import dotenv from "dotenv";

// import Bull , { Job } from 'bull';
import parsePhoneNumber, { PhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { Attachment } from './services/whatsapp/type';
import { replaceHtmlEntities, timeout } from './utils';

dotenv.config();
const PORT = process.env.PORT || 5000;
const app = express()

const { combine, timestamp, prettyPrint, colorize, errors,  } = format; 
// Create a logger instance
const logger = createLogger({
    // level: 'info', // Set the log level
    // format: winston.format.json(), // Specify the log format
    format: combine(
      errors({ stack: true }), // <-- use errors format
      colorize(),
      timestamp(),
      prettyPrint()
    ),
    transports: [
      new transports.Console(), // Log to console
      new transports.File({ filename: 'application.log' }), // Log to a file
    ],
})

// interface waServiceClassObject {
//     [key: string]: WaService;
// }

interface waServiceClassMap<T extends WaService> {
    [key: string]: T;
}


// let waServiceClass: [waServiceClassObject];
let waServiceClass: waServiceClassMap<WaService> | undefined = {};
const credBaseDir = 'wa-auth-creds';
const qrCodeBasedir = './wa-bots/qr-codes';

// const initWaServer = async (): Promise<WaService> => {
//     // console.log('connecting')
//     return new Promise(async (resolve) => {
//         // (async () => {
//             try {
//                 waServiceClass = new WaService(credId, './wa-auth-info');
//                 await waServiceClass.connect();
//                 waServiceClass.on('service.whatsapp.qr', async (value) => {
//                     const dir = `./wa-bots/qr-codes`;
//                     if (!await existsSync(dir)){
//                         await mkdirSync(dir, { recursive: true });
//                     }
//                     await writeFileSync(`${dir}/qr-code-${credId}.txt`, value.qr.toString())
//                 })
//                 // console.log('resolve')
//                 resolve(waServiceClass);
//             } catch (error) {
//                 logger.info(`Error initWaServer`, { error });
//                 // logger.info(e);
//             }
//         // })()
//     });
// }

const initWaServer = (stateId: string): Promise<void> => {
    return new Promise(async (resolve) => {
        // console.log('waServiceClass.connect()')
        // create connection wa service
        await waServiceClass[stateId].connect();
        waServiceClass[stateId].on(`service.whatsapp.qr`, async (value) => {
            if (!await existsSync(qrCodeBasedir)){
                await mkdirSync(qrCodeBasedir, { recursive: true });
            }
            await writeFileSync(`${qrCodeBasedir}/qr-code-${waServiceClass[stateId].getCredId()}.txt`, value.qr.toString())
        });
        // add delay to make sure all connected
        await timeout(6000);
        resolve();
    })
}

const runExpressServer = async () => {
    app.use(express.json());
    app.use(cors());

    app.listen(PORT, () => {
        logger.info(`Whatsapp api app listening on port ${PORT}`)
    });

    app.use(async (req, res, next) => {
        if (req.query?.cred_id) {
            const stateId = req.query.cred_id.toString();
            // console.log(`waServiceClass[${stateId}]`, waServiceClass[stateId])
            if (!waServiceClass[stateId]) {
                // init wa service
                waServiceClass[stateId] = new WaService(stateId)
                waServiceClass[stateId].setCredBaseDir(credBaseDir);
                try {
                    await waServiceClass[stateId].checkConnection();
                } catch (e) {
                    if (typeof e === 'string' && e === 'waiting for connection') {
                        await initWaServer(stateId);
                    }
                }
            }
        } else {
            return res.status(400).json('cred_id is required')
        }
        next()
    })
      

    app.get('/', (req, res) => {
        res.send('🇵🇸 Free Palestine!')
    })

    app.get('/delete-temp-files', (req, res) => {
        // @ts-ignore
        const stateId = req.query.cred_id.toString();
        if (!waServiceClass[stateId]) {
            return res.status(400).json('connection uninitialized');
        }
        deleteOldTempRemoteFile(stateId);
        res.json('delete on progress')
    })

    app.get('/logout', async (req, res) => {
        // @ts-ignore
        const stateId = req.query.cred_id.toString();
        if (!waServiceClass[stateId]) {
            return res.status(400).json('connection uninitialized');
        }

        try {
            await waServiceClass[stateId].checkConnection()
            waServiceClass[stateId].disconnect();
        } catch (error) {
            logger.info(error)
        }
        await timeout(3000);
        deleteOldTempRemoteFile(stateId);
        res.json('success logout')
    });

    app.get('/restart', async (req, res) => {
        // @ts-ignore
        const stateId = req.query.cred_id.toString();
        if (!waServiceClass[stateId]) {
            return res.status(400).json('connection uninitialized');
        }

        try {
            // await waServiceClass.checkConnection();
            waServiceClass[stateId].disconnect(true);
        } catch (error) {
            logger.info(error)
        }
        // you must add delay to make sure everything done
        await timeout(3000);
        
        try {
            await waServiceClass[stateId].forceReset();
            // const dir = `./wa-bots/qr-codes`;
            // if (await existsSync(dir)){
            //     await rmSync(dir, { recursive: true, force: true });
            // }
        } catch (error) {
            logger.info(error)
        }
        await initWaServer(stateId);
        res.json('success restart')
    })

    app.get('/get-qrcode', async (req, res) => {
        // @ts-ignore
        const stateId = req.query.cred_id.toString();
        if (!waServiceClass[stateId]) {
            return res.status(400).json('connection uninitialized');
        }

        try {
            await waServiceClass[stateId].checkConnection();
            res.json('connected');
            return ;
        } catch (e) {
        }

        let qrCodeString: string = '';
        try {
            qrCodeString = await readFileSync(`${qrCodeBasedir}/qr-code-${waServiceClass[stateId].getCredId()}.txt`, 'utf-8');
        } catch (err) {
            console.error(err)
            res.send('qr code not available');
            return ;
        }

        try {
            qrCodeString = await QRCode.toDataURL(qrCodeString);
            res.setHeader("Content-Type", "text/html")
            res.send(`
                <img src="${qrCodeString}" />
                <h1>Scan Segera</h1>
            `)
        } catch (err) {
            console.error(err)
            res.send('failed to get qr code')
        }
    })

    // app.get('/keep-alive', async (req, res) => {
    //     try {
    //         if (process.env.KEEP_ALIVE_NUMBER) {
    //             // await waServiceClass.checkConnection()
    //             // waMessageQueue.add({
    //             //     to: process.env.KEEP_ALIVE_NUMBER ? process.env.KEEP_ALIVE_NUMBER : '',
    //             //     message:
    //             //     '*REPORT '+ credId +'*\n\nStatus: *Active*\nLast Update: *' + new Date().toLocaleString() + '*\nStamp: *' + ( (Math.random() + 1).toString(36).substring(7) ) + '*\n\n\n\nTerima Kasih Telah menggunakan layanan kami\n\n*Masbroweb.com*'
    //             // });
    //             await waServiceClass.sendTextMessage(
    //                 process.env.KEEP_ALIVE_NUMBER ? process.env.KEEP_ALIVE_NUMBER : '',
    //                 '*REPORT '+ credId +'*\n\nStatus: *Active*\nLast Update: *' + new Date().toLocaleString() + '*\nStamp: *' + ( (Math.random() + 1).toString(36).substring(7) ) + '*\n\n\n\nTerima Kasih Telah menggunakan layanan kami\n\n*Masbroweb.com*'
    //             );
    //         }
    //         res.send('success send message queue')
    //     } catch (e) {
    //         console.error('error send message', e)
    //         res.send('failed send message')
    //     }
    // })

    app.get('/get-state', async (req, res) => {
        // @ts-ignore
        const stateId = req.query.cred_id.toString();
        if (!waServiceClass[stateId]) {
            return res.status(400).json('connection uninitialized');
        }

        try {
            await waServiceClass[stateId].checkConnection();
            res.json('connected');
        } catch (e) {
            console.error('error get state', e)
            return res.status(400).json(typeof e === 'string' ? e : 'failed check connection')
        }
    })

    app.post('/send-text-message',
      body('phone_number').notEmpty().escape(),
      body('message').notEmpty().escape(),
      async (req, res) => {
        // @ts-ignore
        const stateId = req.query.cred_id.toString();
        if (!waServiceClass[stateId]) {
            return res.status(400).json('connection uninitialized');
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const phoneNumber = isValidPhoneNumber(req.body.phone_number, 'ID') ? parsePhoneNumber(req.body.phone_number, 'ID') : null
        if (phoneNumber) {
            req.body.phone_number = phoneNumber.number.toString().replace("+", "");
        } else {
            return res.status(400).json({ errors: [
                {
                    value: req.body.phone_number,
                    msg: 'Invalid phone number',
                    param: 'phone_number',
                    location: 'body'
                }
            ] });
        }

        try {
            await waServiceClass[stateId].checkConnection();
            // setTimeout(() => {
            // let message = req.body.message.replaceAll('&amp;#x2F;', "/");
            // message = message.replaceAll('&#x2F;', "/");
            // console.log('req.body.message', req.body.message)
            await waServiceClass[stateId].sendTextMessage(req.body.phone_number, replaceHtmlEntities(req.body.message))
            // , 7000});
            // waMessageQueue.add({
            //     to: req.body.phone_number,
            //     message: req.body.message
            // });
            res.json('success')
        } catch (e) {
            logger.info(e)
            if (e === 'waiting for connection') {
                return res.status(400).json('please wait a second')
            } else if (e === 'no active connection found') {
                return res.status(400).json('please scan barcode')
                // return res.redirect('/scan-barcode')
            } else if (e === 'number not exists') {
                return res.status(400).json('number not exists')
                // return res.redirect('/scan-barcode')
            }
            res.status(500).json('failed send message')
        }
    });

    app.post('/send-media-message',
      body('phone_number').notEmpty().escape(),
      body('message').escape(),
      body('media').notEmpty(),
      body('media_filename').notEmpty(),
      async (req, res) => {
        // @ts-ignore
        const stateId = req.query.cred_id.toString();
        if (!waServiceClass[stateId]) {
            return res.status(400).json('connection uninitialized');
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const phoneNumber = isValidPhoneNumber(req.body.phone_number, 'ID') ? parsePhoneNumber(req.body.phone_number, 'ID') : null
        if (phoneNumber) {
            req.body.phone_number = phoneNumber.number.toString().replace("+", "");
        } else {
            return res.status(400).json({ errors: [
                {
                    value: req.body.phone_number,
                    msg: 'Invalid phone number',
                    param: 'phone_number',
                    location: 'body'
                }
            ] });
        }

        try {
            await waServiceClass[stateId].checkConnection();
            // setTimeout(() => {
            let message = '';
            // console.log('req.body.message', req.body.message)
            if (req.body.message) {
                message = replaceHtmlEntities(req.body.message)
            }
            const media: Attachment = {
                url: req.body.media,
                name: req.body.media_filename,
                filesize: 0,
                type: 'photo'
            }
            waServiceClass[stateId].sendMediaMessage(req.body.phone_number, media, message)
            res.json('success')
        } catch (e) {
            logger.info(e)
            if (e === 'waiting for connection') {
                return res.status(400).json('please wait a second')
            } else if (e === 'no active connection found') {
                return res.status(400).json('please scan barcode')
                // return res.redirect('/scan-barcode')
            } else if (e === 'number not exists') {
                return res.status(400).json('number not exists')
                // return res.redirect('/scan-barcode')
            }
            res.status(500).json('failed send message')
        }
    });
    // return app;
}
runExpressServer();
// console.log('connected')
// export default app;