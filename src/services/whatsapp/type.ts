export enum AttachmentTypes {
    'photo',
    // 'video',
    // 'audio',
    // 'gif',
    'document'
}

export interface Attachment {
    // path?: string;
    url: string;
    name: string;
    filesize: number;
    type: AttachmentTypes;
}

export enum ConnectionState {
    'idle',
    'disconnected',
    'connected'
}
  
export interface PreparedPhotoFile {
    type: string;
    image: Buffer
}
  
export interface PreparedVideoFile {
    type: string;
    video: Buffer;
    jpegThumbnail: string
}
  
export interface PreparedDocumentFile {
    type: string;
    document: Buffer;
    mimetype: string;
    fileName: string
}