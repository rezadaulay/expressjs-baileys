//mongodb+srv://aku:aku@aku.b49zmdt.mongodb.net/?retryWrites=true&w=majority&appName=aku



import { connect, Connection } from 'mongoose';
import { SessionModel, TSessionDocument } from './models/session';

export default class DatabaseHandler {
    public readonly DB = { session: SessionModel };
    public connected = false;
    public connection: Connection | undefined;

    public constructor() {}

    public connect = async (): Promise<void> => {
        const uri = process.env.MONGODB_URI; // ✅ load from env
        if (!uri) {
            console.error('MONGODB_URI is missing, please fill the value!');
            process.exit(1);
        }
        try {
            const { connection } = await connect(uri);
            connection.once('open', () => console.log('Database connection opened!'));
            connection.on('connected', () => console.log('Database connected!'));
            connection.on('error', (error) => console.error(error));
            this.connection = connection;
            this.connected = true;
        } catch (err) {
            console.error(String(err));
            this.connection = undefined;
            this.connected = false;
        }
    };

    public get Session(): typeof SessionModel {
        return this.DB.session;
    }

    public getSession = async (sessionId: string): Promise<TSessionDocument | null> => {
        return await this.DB.session.findOne({ sessionId });
    };

    public saveNewSession = async (sessionId: string): Promise<void> => {
        await new this.DB.session({ sessionId }).save();
    };

    public updateSession = async (sessionId: string, session: string): Promise<void> => {
        await this.DB.session.updateOne({ sessionId }, { $set: { session } });
    };

    public removeSession = async (sessionId: string): Promise<void> => {
        await this.DB.session.deleteOne({ sessionId });
    };
}
