import AuthenticationCard from "@/app/lib/components/auth/authentication-card"

export default function Login() {
  return (
    <div className="w-full min-h-screen relative flex flex-col items-center justify-center p-4 overflow-hidden bg-[#7ead92]">
      
      {/* LAG TEST: background art temporarily disabled — flat colour only
          (greenery_a.png is ~7.8 MB unoptimized). Restore once ruled out. */}
      {/* <Image
        src="/images/greenery_a.png"
        alt="Login Background"
        fill
        className="object-cover"
        priority
        quality={100}
        unoptimized
      /> */}

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