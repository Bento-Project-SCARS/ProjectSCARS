// Temporary OAuth functions for Microsoft and Facebook until SDK is regenerated
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { GetAccessTokenHeader } from "@/lib/utils/token";

export const oauthLinkMicrosoftV1AuthOauthMicrosoftLinkGet = async (options: { query: { code: string }; headers: { Authorization: string } }) => {
    try {
        const url = new URL('/v1/auth/oauth/microsoft/link', 'http://localhost:8081');
        url.searchParams.set('code', options.query.code);
        
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: options.headers,
        });
        
        if (!response.ok) {
            return {
                error: true,
                response: { status: response.status, statusText: response.statusText }
            };
        }
        
        const data = await response.json();
        return { error: false, data };
    } catch {
        return {
            error: true,
            response: { status: 500, statusText: 'Network error' }
        };
    }
};

export const oauthUnlinkMicrosoftV1AuthOauthMicrosoftUnlinkGet = async (options: { headers: { Authorization: string } }) => {
    try {
        const response = await fetch('http://localhost:8081/v1/auth/oauth/microsoft/unlink', {
            method: 'GET',
            headers: options.headers,
        });
        
        if (!response.ok) {
            return {
                error: true,
                response: { status: response.status, statusText: response.statusText }
            };
        }
        
        const data = await response.json();
        return { error: false, data };
    } catch {
        return {
            error: true,
            response: { status: 500, statusText: 'Network error' }
        };
    }
};

export const oauthLinkFacebookV1AuthOauthFacebookLinkGet = async (options: { query: { code: string }; headers: { Authorization: string } }) => {
    try {
        const url = new URL('/v1/auth/oauth/facebook/link', 'http://localhost:8081');
        url.searchParams.set('code', options.query.code);
        
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: options.headers,
        });
        
        if (!response.ok) {
            return {
                error: true,
                response: { status: response.status, statusText: response.statusText }
            };
        }
        
        const data = await response.json();
        return { error: false, data };
    } catch {
        return {
            error: true,
            response: { status: 500, statusText: 'Network error' }
        };
    }
};

export const oauthUnlinkFacebookV1AuthOauthFacebookUnlinkGet = async (options: { headers: { Authorization: string } }) => {
    try {
        const response = await fetch('http://localhost:8081/v1/auth/oauth/facebook/unlink', {
            method: 'GET',
            headers: options.headers,
        });
        
        if (!response.ok) {
            return {
                error: true,
                response: { status: response.status, statusText: response.statusText }
            };
        }
        
        const data = await response.json();
        return { error: false, data };
    } catch {
        return {
            error: true,
            response: { status: 500, statusText: 'Network error' }
        };
    }
};