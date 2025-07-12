export interface UserPreferences {
    accentColor: string;
    language: string;
}

export type ServerMessageType = {
    message: string;
};

export type SchoolUpdateType = {
    id: number;
    name: string;
    address?: string | null;

    phone?: string | null;
    email?: string | null;
    website?: string | null;

    logoUrn?: string | null;

    deactivated?: boolean | null;
};
