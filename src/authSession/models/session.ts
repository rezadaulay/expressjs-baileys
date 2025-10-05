import { prop, getModelForClass } from '@typegoose/typegoose';
import { Document } from 'mongoose';

export class SessionsSchema {
    @prop({ type: String, required: true, unique: true })
    public sessionId!: string;

    @prop({ type: String })
    public session?: string;

    @prop({ type: String, default: '' })
    public number!: string;

    @prop({ type: Boolean, default: false })
    public active!: boolean;
}

export type TSessionDocument = SessionsSchema & Document;

export const SessionModel = getModelForClass(SessionsSchema);
