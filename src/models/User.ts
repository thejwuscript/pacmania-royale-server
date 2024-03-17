export interface User {
  id: string;
  name: string;
}

export const users = new Map<string, User>();