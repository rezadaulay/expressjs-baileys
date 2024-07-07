import 'dotenv/config';
import express from "express";
import WaService from './services/whatsapp';
import cors from "cors";
import { existsSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'fs';
import QRCode from 'qrcode';
import { body, validationResult } from "express-validator";
import * as winston from "winston";  
import dotenv from "dotenv";

import Bull , { Job } from 'bull';
import parsePhoneNumber, { PhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { Attachment } from './services/whatsapp/type';

dotenv.config();
const PORT = process.env.PORT || 5000;
const app = express()

// Create a logger instance
const logger = winston.createLogger({
    level: 'info', // Set the log level
    format: winston.format.json(), // Specify the log format
    transports: [
      new winston.transports.Console(), // Log to console
      new winston.transports.File({ filename: 'application.log' }), // Log to a file
    ],
});

const credId = 'bot-1';
let bot1WaServiceClass:WaService;
const initWaServer = async (): Promise<WaService> => {
    // console.log('connecting')
    return new Promise(async (resolve) => {
        // (async () => {
            try {
                bot1WaServiceClass = new WaService(credId, './wa-auth-info');
                await bot1WaServiceClass.connect();
                bot1WaServiceClass.on('service.whatsapp.qr', async (value) => {
                    const dir = `./wa-bots/qr-codes`;
                    if (!await existsSync(dir)){
                        await mkdirSync(dir, { recursive: true });
                    }
                    await writeFileSync(`${dir}/qr-code-${credId}.txt`, value.qr.toString())
                })
                // console.log('resolve')
                resolve(bot1WaServiceClass);
            } catch (error) {
                logger.error(`Error initWaServer`, { error });
                // logger.info(e);
            }
        // })()
    });
}

const runExpressServer = async () => {
    // const waMessageQueue = new Bull('wa-message', {
    //     defaultJobOptions: {
    //         attempts: 3
    //     },
    //     redis: {
    //         host: process.env.REDIS_HOST,
    //         port: parseInt(process.env.REDIS_PORT ? process.env.REDIS_PORT : '6379'),
    //         password: process.env.REDIS_PASSWORD
    //     },
    //     // Limit queue to max 1 jobs per 7 seconds.
    //     limiter: {
    //         max: 1,
    //         duration: process.env.QUEUE_LIMIT_DURATION ? parseInt(process.env.QUEUE_LIMIT_DURATION) : 7000
    //     }
    // });
    // const processWaQueue = async (job: Job) => {
    //     const { to, message } = job.data;
    //     // logger.info('try to process', to, message)
    //     // throw new Error('tes error');
    //     logger.info('processing', to, message)
    //     try {
    //         await bot1WaServiceClass.sendTextMessage(to, message);
    //         logger.info('send to', to, message)
    //     } catch (e) {
    //         logger.error('error send message', e)
    //         throw e;
    //         // if (e === 'waiting for connection') {
    //         //     return res.send('please wait a second')
    //         // } if (e === 'no active connection found') {
    //         //     return res.send('please scan barcode')
    //         //     // return res.redirect('/scan-barcode')
    //         // }
    //     }
    // }
    // waMessageQueue.process(processWaQueue);

    app.use(express.json());
    app.use(cors());

    app.listen(PORT, () => {
        logger.info(`Whatsapp api app listening on port ${process.env.PORT}`)
    });

    // app.get('/', (req, res) => {
    //     res.send('Let me go home!')
    // })

    app.get('/logout', async (req, res) => {
        try {
            await bot1WaServiceClass.checkConnection()
            bot1WaServiceClass.disconnect();
        } catch (error) {
            logger.error('error', error)
        }
        res.send('Success logout')
    })

    app.get('/restart', async (req, res) => {
        try {
            // await bot1WaServiceClass.checkConnection();
            bot1WaServiceClass.disconnect(true);
        } catch (error) {
            logger.error('error', error)
        }
        setTimeout(async () => {
            try {
                await bot1WaServiceClass.forceReset(credId);
                // const dir = `./wa-bots/qr-codes`;
                // if (await existsSync(dir)){
                //     await rmSync(dir, { recursive: true, force: true });
                // }
            } catch (error) {
                logger.error('error', error)
            }
            setTimeout(async () => {
                await initWaServer();
                res.send('Success restart, please wait about 5 seconds to relogin')
            }, 5000);
        }, 2500);
    })

    app.get('/get-qrcode', async (req, res) => {
        try {
            await bot1WaServiceClass.checkConnection();
            res.send('already connected');
            return ;
        } catch (e) {
        }

        const dir = `./wa-bots/qr-codes`;
        let qrCodeString: string = '';
        try {
            qrCodeString = await readFileSync(`${dir}/qr-code-${credId}.txt`, 'utf-8');
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

    app.get('/keep-alive', async (req, res) => {
        try {
            if (process.env.KEEP_ALIVE_NUMBER) {
                // await bot1WaServiceClass.checkConnection()
                // waMessageQueue.add({
                //     to: process.env.KEEP_ALIVE_NUMBER ? process.env.KEEP_ALIVE_NUMBER : '',
                //     message:
                //     '*REPORT '+ credId +'*\n\nStatus: *Active*\nLast Update: *' + new Date().toLocaleString() + '*\nStamp: *' + ( (Math.random() + 1).toString(36).substring(7) ) + '*\n\n\n\nTerima Kasih Telah menggunakan layanan kami\n\n*Masbroweb.com*'
                // });
                await bot1WaServiceClass.sendTextMessage(
                    process.env.KEEP_ALIVE_NUMBER ? process.env.KEEP_ALIVE_NUMBER : '',
                    '*REPORT '+ credId +'*\n\nStatus: *Active*\nLast Update: *' + new Date().toLocaleString() + '*\nStamp: *' + ( (Math.random() + 1).toString(36).substring(7) ) + '*\n\n\n\nTerima Kasih Telah menggunakan layanan kami\n\n*Masbroweb.com*'
                );
            }
            res.send('success send message queue')
        } catch (e) {
            console.error('error send message', e)
            res.send('failed send message')
        }
    })

    app.get('/get-state', async (req, res) => {
        try {
            await bot1WaServiceClass.checkConnection();
            res.send('connected');
        } catch (e) {
            // console.error('error send message', e)
            res.send('failed check connection')
        }
    })

    app.post('/send-text-message',
      body('phone_number').notEmpty().escape(),
      body('message').notEmpty().escape(),
      async (req, res) => {
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
            await bot1WaServiceClass.checkConnection();
            // setTimeout(() => {
            let message = req.body.message.replaceAll('&amp;#x2F;', "/");
            message = message.replaceAll('&#x2F;', "/");
            bot1WaServiceClass.sendTextMessage(req.body.phone_number, message)
            // , 7000});
            // waMessageQueue.add({
            //     to: req.body.phone_number,
            //     message: req.body.message
            // });
            res.send('success send message queue')
        } catch (e) {
            logger.error('error send message', e)
            if (e === 'waiting for connection') {
                return res.send('please wait a second')
            } else if (e === 'no active connection found') {
                return res.send('please scan barcode')
                // return res.redirect('/scan-barcode')
            } else if (e === 'number not exists') {
                return res.send('number not exists')
                // return res.redirect('/scan-barcode')
            }
            res.send('failed send message')
        }
    });

    app.post('/send-media-message',
      body('phone_number').notEmpty().escape(),
      body('message').escape(),
      body('media').notEmpty(),
      body('media_filename').notEmpty(),
      async (req, res) => {
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
            await bot1WaServiceClass.checkConnection();
            // setTimeout(() => {
            let message = '';
            if (req.body.message) {
                message = req.body.message.replaceAll('&amp;#x2F;', "/").replaceAll('&#x2F;', "/");
            }
            const media: Attachment = {
                url: req.body.media,
                name: req.body.media_filename,
                filesize: 0,
                type: 'photo'
            }
            bot1WaServiceClass.sendMediaMessage(req.body.phone_number, media, message)
            res.send('success send message queue')
        } catch (e) {
            logger.error('error send message', e)
            if (e === 'waiting for connection') {
                return res.send('please wait a second')
            } else if (e === 'no active connection found') {
                return res.send('please scan barcode')
                // return res.redirect('/scan-barcode')
            } else if (e === 'number not exists') {
                return res.send('number not exists')
                // return res.redirect('/scan-barcode')
            }
            res.send('failed send message')
        }
    });
    // return app;
}

const initWebServer = async () => {
    await initWaServer();
    runExpressServer()
}

initWebServer();
// console.log('connected')
// export default app;