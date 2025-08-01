
export type User = {
	id: string;
	username: string;
	iat?: number;
	email?: string;
	emailVerified?: Date | null;
}
