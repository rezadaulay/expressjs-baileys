import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState, WASocket } from '@whiskeysockets/baileys';
// import QRCode from 'qrcode';
import { /* writeFileSync, */ unlinkSync, readFileSync, mkdirSync, existsSync, rmSync, writeFileSync, createWriteStream } from 'fs';
import { Attachment, ConnectionState, PreparedPhotoFile, PreparedVideoFile, PreparedDocumentFile } from './type';
import { dirname, join } from 'path'
import { Boom } from '@hapi/boom'
import { tmpdir } from 'os'
import { EventEmitter } from 'events';
import axios from 'axios';
import { downloadTempRemoteFile } from './../../utils';
import { createLogger, format, transports } from 'winston';
// const { exec } = require("child_process");
// const pathToFfmpeg = require('ffmpeg-static');

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

interface ConnectionObject {
  [key: string]: WASocket;
}

export default class WhatsApp extends EventEmitter {
    private connections: ConnectionObject;
    private credId: string;
    private credBaseDir: string = '';
    private state: ConnectionState;
    constructor (credId: string) {
      super();
      this.credId = credId;
    //   this.credBaseDir = credBaseDir;
      this.state = ConnectionState.idle;
      this.connections = {};
    }

    getCredId (): string {
      return this.credId
    }

    setCredBaseDir (credBaseDir: string): void {
        this.credBaseDir = credBaseDir;
    }

    getConnections (): { [key: string]: WASocket } {
      return this.connections;
    }

    findConnection (): WASocket | null {
      return this.connections[this.credId] ? this.connections[this.credId] : null;
    }

    setConnection (sock: WASocket): WASocket {
      return this.connections[this.credId] = sock;
    }

    // private async extractVideoThumb(
    //   path: string,
    //   destPath: string,
    //   time: string,
    //   size: { width: number, height: number },
    // ): Promise<void> {
    //   return new Promise((resolve, reject) => {
    //     const cmd = `${pathToFfmpeg} -ss ${time} -i ${path.replace(/ /g, '\\ ')} -y -vf scale=${size.width}:-1 -vframes 1 -f image2 ${destPath}`
    //     exec(cmd, (err: Error) => {
    //       if(err) {
    //         reject(err)
    //       }
    //       resolve()
    //     })
    //   })
    // }

    restartWebSocket (): void {
      const conn = this.findConnection()
      if (conn) {
        this.setState(ConnectionState.idle)
        conn.end(new Error("restart"))
      }
    }

    async removeConnection (force = false): Promise<void> {
      if (this.connections[this.credId]) {
        if (force) {
          try {
            this.connections[this.credId].logout()
            // this.connections[this.credId].ws.close()
            // this.connections[this.credId].end(new Error('force close'))
          } catch (e) {}
        } else {
          this.connections[this.credId].logout()
        }
        delete this.connections[this.credId]
        const dir = this.credBaseDir + '/' + this.credId;
        if (await existsSync(dir)){
          await rmSync(dir, { recursive: true, force: true });
        }
      }
    }

    forceReset (): Promise<null> {
      return new Promise(async (resolve) => {
        // (async () => {
          const dir = this.credBaseDir + '/' + this.getCredId();
          if (await existsSync(dir)){
            await rmSync(dir, { recursive: true, force: true });
          }
          return resolve(null)
        // })()
      });
    }

    async setState (state: ConnectionState) {
      if (state !== this.state) {
        this.state = state;
        // const dir = `./wa-bots/states`;
        // if (!await existsSync(dir)){
        //   await mkdirSync(dir, { recursive: true });
        // }
        // await writeFileSync(`${dir}/state-${this.credId}.txt`, state.toString());
        this.triggerEvent('state', state);
      }
    }

    async getState (): Promise<ConnectionState> {
      return Promise.resolve(this.state);
      // const state: string = await readFileSync(`./wa-bots/states/state-${this.credId}.txt`, 'utf-8');
      // return Promise.resolve(parseInt(state));
    }

    private triggerEvent (eventName: string, value: any): void {
      this.emit(`service.whatsapp.${eventName}`, value);
    }

    async initializeConnection (): Promise<WASocket | null> {
      const dir = this.credBaseDir;
      if (!await existsSync(dir)){
        await mkdirSync(dir, { recursive: true });
      }
      const { state, saveCreds } = await useMultiFileAuthState(`${dir}/` + this.credId)
      const sock = makeWASocket({
        syncFullHistory: true,
        browser: Browsers.windows('Desktop'),
        // markOnlineOnConnect: false,
        printQRInTerminal: false,
        auth: state,
        generateHighQualityLinkPreview: true,
        retryRequestDelayMs: 3000
      });
      this.generateQR(sock)

      sock.ev.on('creds.update', () => {
        saveCreds()
      })

      this.setConnection(sock)
      return this.findConnection()
    }

    async generateQR (sock: WASocket): Promise<string> {
        return new Promise((resolve, reject) => {
          sock.ev.on('connection.update', async (update) => {
            if (update.connection === 'close' && (update.lastDisconnect?.error as Boom)?.output?.statusCode === DisconnectReason.restartRequired) {
              // create a new socket, this socket is now useless
              await this.initializeConnection()
            } else if (update.connection === 'open') {
              this.setState(ConnectionState.connected)
            }
            // console.log('credId', this.credId)
            // console.log('wa-update', update)
            // if (update.connection === 'open') {
            //   this.setState(ConnectionState.connected)
            // } else if (update.connection === 'close') {
            //   const shouldReconnect = (update.lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            //   logger.info('connection closed due to ', update.lastDisconnect?.error, ', reconnecting ', shouldReconnect)
            //   // console.log('connection closed due to ', update.lastDisconnect?.error, ', reconnecting ', shouldReconnect)
            // // reconnect if not logged out
            //   // if(shouldReconnect) {
            //   //   this.setState(ConnectionState.connected)
            //   // } else {
            //   //   this.setState(ConnectionState.disconnected)
            //   // }
            //   if(shouldReconnect) {
            //     this.setState(ConnectionState.connected)
            //     // this.initializeConnection()
            //   } else {
            //     // await this.initializeConnection()
            //     // sock.end(new Error("restart"))
            //     this.setState(ConnectionState.disconnected)
            //   }

            //   // console.log('update.connection', update.connection)
            //   // this.setState(ConnectionState.disconnected)
            // }
            // else {
            //   this.setState(credId, ConnectionState.disconnected)
            // }
            // const dir = `./wa-bots/qr-codes`;
            // if (!await existsSync(dir)){
            //   await mkdirSync(dir, { recursive: true });
            // }
            // const qrFilePath = `${dir}/qr-code-${this.credId}.png`;
            // if (update.isNewLogin) {
              // console.log('isNewLogin')
              // this.initializeConnection()
              // await unlinkSync(qrFilePath);
            // }
            if (update.qr) {
              // console.log('get qr', update.qr)
              this.setState(ConnectionState.disconnected)
              this.triggerEvent('qr', {
                // path: qrFilePath,
                qr: update.qr
              })
              // console.log('Scan the QR code with your WhatsApp app.')
              resolve(update.qr)
              // QRCode.toFile(qrFilePath, update.qr, {
              //   errorCorrectionLevel: 'H',
              // }).then(() => {
              //   this.triggerEvent('qr', {
              //     path: qrFilePath,
              //     qr: update.qr
              //   })
              //   // console.log('Scan the QR code with your WhatsApp app.')
              //   resolve(qrFilePath)
              // }).catch(err => {
              //   reject(err)
              // })              
            }
          })
        })
    }

    async connect (): Promise<WASocket | null> {
      return new Promise(async (resolve, reject) => {
        // (async () => {
          try {
            let sock = this.findConnection();
            // this.setState(ConnectionState.idle)
      
            if (!sock) {
              // console.log('initializeConnection')
              sock = await this.initializeConnection()
            }

            setTimeout(async () => {
              // console.log('state', await this.getState());
              this.triggerEvent('state', await this.getState());
            }, 3000);
      
            // sock.ev.on('connection.update', (update) => {
            //   if (update.connection === 'open') {
            //     // sock.auth
            //     console.log('sock.auth', sock)
            //     this.setSessionToDB(credId, sock)
            //   }
            // })
      
            resolve(sock)
          } catch (error) {
            reject(error)
          }
        // })()
      });
    }
    
    async disconnect (force = false): Promise<null> {
      // this.setState(ConnectionState.idle)
      return new Promise((resolve, reject) => {
        try {
          this.removeConnection(force)
          resolve(null);
          // delete folder wa-bot-info
        } catch (error) {
          reject(error)
        }
      });
      // setTimeout(() => {
      //   this.setState(ConnectionState.disconnected)
      // }, 1500);
    }

    async checkConnection (): Promise<ConnectionState> {
      return new Promise(async (resolve, reject) => {
        // (async () => {
          try {
            const conn = this.findConnection()
            const state = await this.getState()
            if (state === ConnectionState.idle) {
              return reject('waiting for connection')
            }
            if (state === ConnectionState.disconnected || !conn) {
              return reject('no active connection found')
            }
            return resolve(state)
          } catch (error) {
            return reject(error)
          }
        // })()
      })
    }

    async sendTextMessage (destinationNumber: string, messageContent: string): Promise<string> {
      return new Promise(async (resolve, reject) => {
        // (async () => {
          try {
            if (!destinationNumber || !messageContent) {
              return reject('missing required parameters')
            }
      
            const formattedRecipient = `${destinationNumber}@c.us`
            if (!/^[\d]+@c.us$/.test(formattedRecipient)) {
              return reject('invalid recipient format')
            }
      
            const conn = this.findConnection()
            const state = await this.getState()
            if (state === ConnectionState.idle) {
              return reject('waiting for connection')
            }
            if (state === ConnectionState.disconnected || !conn) {
              return reject('no active connection found')
            }

            // const [result] = await conn.onWhatsApp(formattedRecipient);
            // @ts-ignore
            const [result] = await conn.onWhatsApp(formattedRecipient)
            if (result.exists) {
              
            } else {
              return reject('number not exists')
            }

      
            await conn.sendMessage(formattedRecipient, { text: messageContent })
            return resolve(`success send message to ${formattedRecipient} with message ${messageContent}`)
          } catch (error) {
            return reject(error)
          }
        // })()
      })
    }

    // downloadTempRemoteFile (url: string, saveAs: string): Promise<string> {
    //   // console.log('downloadTempRemoteFile')
    //   return new Promise(async (resolve, reject) => {
    //     // (async () => {
    //       // console.log('downloadTempRemoteFile')
    //       const destinationFile = `tmp/${this.getCredId()}/` + saveAs;
    //       if (await existsSync(destinationFile)){
    //         // console.log('destinationFile')
    //         return resolve(destinationFile);
    //       }
    //       // make directory
    //       const dir = dirname(destinationFile);
    //       if (!await existsSync(dir)){
    //         await mkdirSync(dir, {
    //           recursive: true
    //         });
    //         // console.log('mkdirSync')
    //       }
    //       try {
    //       } catch (e) {
    //         return reject(e);
    //       }
    //       // save file
    //       axios({
    //         method: 'get',
    //         url: url,
    //         responseType: 'stream'
    //       }).then(function (response) {
    //         response.data.pipe(
    //           createWriteStream(destinationFile)
    //           .on('finish', function () {
    //             setTimeout(() => {
    //               // create cron job to delete tmp file periodically
    //               resolve(destinationFile)
    //             }, 500);
    //           }).on('error', e => reject(e))
    //         )
    //       }).catch(e => reject(e));
    //     // })
    //   });
    // }

    async sendMediaMessage (destinationNumber: string, file: Attachment, messageContent: string): Promise<string> {
      return new Promise(async (resolve, reject) => {
        // (async () => {
          try {
            if (!destinationNumber || !file || !file.url) {
              return reject('missing required parameters')
            }

            const formattedRecipient = `${destinationNumber}@c.us`
            if (!/^[\d]+@c.us$/.test(formattedRecipient)) {
              return reject('invalid recipient format')
            }
      
            const conn = this.findConnection()
            const state = await this.getState()
            if (state === ConnectionState.idle) {
              return reject('waiting for connection')
            }
            if (state === ConnectionState.disconnected || !conn) {
              return reject('no active connection found')
            }

            const [result] = await conn.onWhatsApp(formattedRecipient);
            if (!result.exists) {
              return reject('number not exists')
            }

            const savedFile = await downloadTempRemoteFile(this.getCredId(), file.url, file.name);
            // console.log('savedFile', savedFile)

            if (file.type === 'photo') {
              await conn.sendMessage(formattedRecipient, { 
                image: readFileSync(savedFile), 
                // image: { url: file.url }, 
                caption: messageContent
                // gifPlayback: true
              });
            } /* else if (file.type === 'video') {
              // generate thumbnail
              let jpegThumbnail = null;
              const imgFilename = join(tmpdir(), ( 'BAE5' + Math.floor(Math.random() * 10) ) + '.jpg')
              try {
                await this.extractVideoThumb(file.path, imgFilename, '00:00:00', { width: 32, height: 32 })
                const buff = await readFileSync(imgFilename)
                jpegThumbnail = buff.toString('base64')
                await unlinkSync(imgFilename)
              } catch(err) {
                return reject(err)
              }
              await conn.sendMessage(formattedRecipient, { 
                video: readFileSync(file.path), 
                caption: messageContent,
                jpegThumbnail: jpegThumbnail
                // gifPlayback: true
              });
            } else {
              const ext = file.path.split('.').pop();
              let mimetype = 'application/pdf';
              if (ext === 'csv') {
                mimetype = 'text/csv';
              } else if (ext === 'doc' || ext === 'docx') {
                mimetype = 'application/msword';
              } else if (ext === 'xls' || ext === 'xlsx') {
                mimetype = 'application/vnd.ms-excel';
              } else if (ext === 'ppt' || ext === 'pptx') {
                mimetype = 'application/vnd.ms-powerpoint';
              }
              await conn.sendMessage(formattedRecipient, { 
                document: readFileSync(file.path), 
                caption: messageContent,
                mimetype: mimetype,
                fileName: file.name,
                // gifPlayback: true
              });
            } */

            return resolve(`success send message to ${formattedRecipient} with media ${file.url}`)
          } catch (error) {
            return reject(error)
          }
        // })()
      })
    }

    // async prepareMediaMessage (file: Attachment): Promise<PreparedPhotoFile | PreparedVideoFile | PreparedDocumentFile> {
    //   return new Promise((resolve, reject) => {
    //     (async () => {
    //       if (!file || !file.path) {
    //         return reject('missing required parameters')
    //       }
    //       try {
    //         if (file.type === 'photo') {
    //           const result: PreparedPhotoFile = {
    //             type: file.type,
    //             image: readFileSync(file.path)
    //           };
    //           return resolve(result);
    //         } else if (file.type === 'video') {
    //           // generate thumbnail
    //           let jpegThumbnail = null;
    //           const imgFilename = join(tmpdir(), ( 'BAE5' + Math.floor(Math.random() * 10) ) + '.jpg')
    //           try {
    //             await this.extractVideoThumb(file.path, imgFilename, '00:00:00', { width: 32, height: 32 })
    //             const buff = await readFileSync(imgFilename)
    //             jpegThumbnail = buff.toString('base64')
    //             await unlinkSync(imgFilename)
    //           } catch(err) {
    //             return reject(err)
    //           }
    //           const result: PreparedVideoFile = {
    //             type: file.type,
    //             video: readFileSync(file.path), 
    //             jpegThumbnail: jpegThumbnail
    //           };
    //           return resolve(result);
    //         } else {
    //           const ext = file.path.split('.').pop();
    //           let mimetype = 'application/pdf';
    //           if (ext === 'csv') {
    //             mimetype = 'text/csv';
    //           } else if (ext === 'doc' || ext === 'docx') {
    //             mimetype = 'application/msword';
    //           } else if (ext === 'xls' || ext === 'xlsx') {
    //             mimetype = 'application/vnd.ms-excel';
    //           } else if (ext === 'ppt' || ext === 'pptx') {
    //             mimetype = 'application/vnd.ms-powerpoint';
    //           }
    //           const result: PreparedDocumentFile = {
    //             type: file.type,
    //             document: readFileSync(file.path), 
    //             mimetype: mimetype,
    //             fileName: file.name,
    //           };
    //           return resolve(result);
    //         }
    //       } catch (error) {
    //         return reject(error)
    //       }
    //     })()
    //   })
    // }

    // async sendPreparedMediaMessage (destinationNumber: string, preparedFile: PreparedPhotoFile | PreparedVideoFile | PreparedDocumentFile, messageContent: string): Promise<string> {
    //   return new Promise((resolve, reject) => {
    //     (async () => {
    //       try {
    //         if (!destinationNumber) {
    //           return reject('missing required parameters')
    //         }
      
    //         const formattedRecipient = `${destinationNumber}@c.us`
    //         if (!/^[\d]+@c.us$/.test(formattedRecipient)) {
    //           return reject('invalid recipient format')
    //         }
      
    //         const conn = this.findConnection()
    //         const state = await this.getState()
    //         if (state === ConnectionState.idle) {
    //           return reject('waiting for connection')
    //         }
    //         if (state === ConnectionState.disconnected || !conn) {
    //           return reject('no active connection found')
    //         }
      
    //         if (preparedFile.type === 'photo') {
    //           preparedFile = preparedFile as PreparedPhotoFile;
    //           await conn.sendMessage(formattedRecipient, { 
    //             image: preparedFile.image, 
    //             caption: messageContent
    //             // gifPlayback: true
    //           });
    //         } else if (preparedFile.type === 'video') {
    //           preparedFile = preparedFile as PreparedVideoFile;
    //           await conn.sendMessage(formattedRecipient, { 
    //             video: preparedFile.video, 
    //             caption: messageContent,
    //             jpegThumbnail: preparedFile.jpegThumbnail
    //             // gifPlayback: true
    //           });
    //         } else {
    //           preparedFile = preparedFile as PreparedDocumentFile;
    //           await conn.sendMessage(formattedRecipient, { 
    //             document: preparedFile.document, 
    //             caption: messageContent,
    //             mimetype: preparedFile.mimetype,
    //             fileName: preparedFile.fileName
    //             // gifPlayback: true
    //           });
    //         }

    //         return resolve(`success send message to ${formattedRecipient} with media`)
    //       } catch (error) {
    //         return reject(error)
    //       }
    //     })()
    //   })
    // }
}