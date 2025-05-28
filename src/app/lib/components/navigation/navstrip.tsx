"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import Image from "next/image";

export default function UserDisplayer() {
  const { data: session, status } = useSession({
    required: false, // Optional: Whether the session is required
  });
  const [badge, setBadge] = useState<string>('');

  // Determine if the user is logged in
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  useEffect(() => {
    if (status === 'authenticated') {
      setIsLoggedIn(true);
    } else {
      setIsLoggedIn(false);
    }
  }, [status, session])

  return (
    <div className="flex justify-center">
      <div className="flex justify-between items-center w-full max-w-[1000px] h-[70px]">
        {/* Logo */}
        <Image
          id="logo"
          src="/logos/navbar-logo.png"
          alt="logo"
          width="200"
          height="200"
        />

        {/* Login Session Details */}
        <div className="flex flex-col items-start h-[30px] w-[200px]">
          <div className="flex flex-row gap-2 items-center">
            {isLoggedIn && session?.user ? (
              <p id="loggedInAs" className="text-[10pt] m-0 text-black">
                Logged in as: {session.user.username}
              </p>
            ) : (
              <p id="loggedInAs" className="text-[10pt] m-0 text-black">
              </p>
            )}
            {/* Optional: display a badge if available */}
            {isLoggedIn && badge && (
              <img
                id="badge"
                src={badge}
                alt="User Badge"
                className="h-[25px] ml-1"
              />
            )}
          </div>
          {/* Optional: if your session includes an "iat" (issued at) timestamp */}
          {isLoggedIn && session?.user?.iat && (
            <p id="lastLoggedIn" className="text-[6pt] m-0 text-gray-500">
              Last login: {new Date(session.user.iat * 1000).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
