
export type User = {
	id: string;
	username: string;
	iat?: number;
	email?: string;
	emailVerified?: Date | null;
	badgeUrl?: string;
	// Equipped title's prestige styling (null = plain title). Drives the
	// gradient+shimmer applied to the user's NAME across the app.
	titleColorFrom?: string | null;
	titleColorTo?: string | null;
	titleTextColor?: string | null;
}
