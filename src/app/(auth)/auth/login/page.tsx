import Image from "next/image"
import AuthenticationCard from "@/app/lib/components/auth/authentication-card"

export default function Login() {
  return (
    <div className="w-full min-h-screen relative flex flex-col items-center justify-center p-4 overflow-hidden bg-[#2a708d]">
      
      {/* 1. BACKGROUND IMAGE */}
      {/* 'fill' mimics absolute inset-0 w-full h-full */}
      {/* 'object-cover' ensures it covers the screen without stretching */}
      <Image
        src="/images/greenery_a.png"
        alt="Login Background"
        fill
        className="object-cover"
        priority // Load this immediately (it's the biggest paint)
        quality={100} // High fidelity for art
        unoptimized
      />

      {/* 2. OVERLAY */}
      {/* Sit on top of the image but behind the content */}
      <div className="absolute inset-0 bg-black/20 z-0" />

      {/* 3. CONTENT */}
      {/* 'z-10' ensures inputs are clickable and sit above the image/overlay */}
      <div className="relative z-10 w-full flex flex-col items-center justify-center">
        <AuthenticationCard />
      </div>

    </div>
  )
}