import ky from "ky";
import { User } from "@/lib/models";
import { Connections } from "./info";
import { LocalStorage } from "@/lib/info";

/** Get the authentication header for API requests.
 * @returns The value of Authentication header to be used in API requests.
 */
export function getAuthenticationHeaderValue(): string {
  const token = localStorage.getItem(LocalStorage.jwt_name);
  if (token) {
    return `Bearer ${token}`;
  }
  throw new Error("No authentication token found");
}

const client = ky.extend({
  prefixUrl: Connections.CentralServer.endpoint,
  headers: {
    Authorization: getAuthenticationHeaderValue(),
  },
});

export async function getUserProfile(): Promise<User | string> {
  const resp = await client.post("/users/me");

  if (resp.status !== 200) {
    return "Failed to fetch user profile";
  }
  const data = await resp.json();
  return data as User;
}

export async function getAllUsers(): User[] {
  // TODO: WIP
}
