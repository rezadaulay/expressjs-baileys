import axios from 'axios';
import { mkdirSync, existsSync, createWriteStream, readdirSync, statSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';

export function timeout(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export function replaceHtmlEntities(input: string): string {
    const entities: { [key: string]: string } = {
        '&#x27;': "'",
        '&amp;#x27;': "'",
        '&quot;': '"',
        '&amp;quot;': '"',
        '&lt;': '<',
        '&amp;lt;': '<',
        '&gt;': '>',
        '&amp;gt;': '>',
        '&nbsp;': ' ',
        '&amp;nbsp;': ' ',
        '&copy;': '©',
        '&amp;copy;': '©',
        '&reg;': '®',
        '&amp;reg;': '®',
        '&euro;': '€',
        '&amp;euro;': '€',
        '&amp;#x2F;': '/',
        '&#x2F;': '/',
        '\\\\': '\\', // Replace double backslash with a single backslash
        '\/': '/',   // Replace forward slash
        // '&amp;': '&', // Uncomment this if you need to replace '&' as well
    };

    return input.replace(/&#x27;|&amp;#x27;|&quot;|&amp;quot;|&lt;|&amp;lt;|&gt;|&amp;gt;|&nbsp;|&amp;nbsp;|&copy;|&amp;copy;|&reg;|&amp;reg;|&euro;|&amp;euro;|&amp;#x2F;|&#x2F;|\\\\|\//g, match => entities[match]);
}

export function downloadTempRemoteFile (credId: string, url: string, saveAs: string): Promise<string> {
    // console.log('downloadTempRemoteFile')
    return new Promise(async (resolve, reject) => {
      // (async () => {
        // console.log('downloadTempRemoteFile')
        const destinationFile = `tmp/${credId}/` + saveAs;
        if (await existsSync(destinationFile)){
          // console.log('destinationFile')
          return resolve(destinationFile);
        }
        // make directory
        const dir = dirname(destinationFile);
        if (!await existsSync(dir)){
          await mkdirSync(dir, {
            recursive: true
          });
          // console.log('mkdirSync')
        }
        try {
        } catch (e) {
          return reject(e);
        }
        // save file
        axios({
          method: 'get',
          url: url,
          responseType: 'stream'
        }).then(function (response) {
          response.data.pipe(
            createWriteStream(destinationFile)
            .on('finish', function () {
              setTimeout(() => {
                // create cron job to delete tmp file periodically
                resolve(destinationFile)
              }, 500);
            }).on('error', e => reject(e))
          )
        }).catch(e => reject(e));
      // })
    });
}

export function deleteOldTempRemoteFile (credId: string): Promise<string> {
    // console.log('downloadTempRemoteFile')
    return new Promise(async (resolve, reject) => {
        const oneHourAgo = Date.now() - 3600000; // 1 hour in milliseconds
        const result = [];
        const folderPath = `tmp/${credId}`;
        try {
            const files = await readdirSync(folderPath);
        
            for (const file of files) {
                const filePath = join(folderPath, file);
                const stats = await statSync(filePath);
        
                if (stats.isFile() && stats.mtimeMs < oneHourAgo) {
                    result.push(filePath);
                }
            }
        } catch (error) {
            //   console.error(`Error reading folder: ${error.message}`);
            reject(error);
        }

        try {
            if (result.length > 0) {
                for (const filePath of result) {
                    await unlinkSync(filePath);
                    console.log(`Deleted file: ${filePath}`);
                }
                // return res.json({ message: 'No files to delete' });
            }
        } catch (error) {
            // console.error(`Error deleting files: ${error.message}`);
            // throw error;
            reject(error);
        }
        
        resolve('success');
    });
};
  