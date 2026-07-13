"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "../ui/label"
import { useSession } from "next-auth/react"
import { Eye, EyeOff, Lock, User, ArrowLeft, Check, Shield, X, Mail } from "lucide-react"

import { useRouter, useSearchParams } from "next/navigation"
// Import actions and types
import { signInAction, signUpAction } from "@/app/lib/actions/auth"
import { LoginFormData } from "@/app/lib/types/form"
// Note: Ensure this path matches where your type is defined (types/auth vs types/form)
import { RegisterFormData } from "@/app/lib/types/auth"

type AuthStep = "login" | "signup" | "forgot-password" | "reset-password" | "otp" | "success"
type AuthMode = "login" | "signup"

interface PasswordRequirement {
  label: string
  test: (password: string) => boolean
}

// Visual requirements for the strength meter
const passwordRequirements: PasswordRequirement[] = [
  { label: "At least 9 characters", test: (pwd) => pwd.length >= 9 },
  { label: "One uppercase letter", test: (pwd) => /[A-Z]/.test(pwd) },
  { label: "One lowercase letter", test: (pwd) => /[a-z]/.test(pwd) },
  { label: "One number", test: (pwd) => /\d/.test(pwd) },
  { label: "One special character", test: (pwd) => /[!@#$%^&*(),.?":{}|<>]/.test(pwd) },
]

export default function AuthenticationCard() {
  const [step, setStep] = useState<AuthStep>("login")
  const [mode, setMode] = useState<AuthMode>("login")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  // Whether the 24h verification email went out (drives the success message).
  const [verificationSent, setVerificationSent] = useState(false)
  const [signupEmail, setSignupEmail] = useState("")

  const { update } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const callbackUrl = searchParams.get("callbackUrl") || null
  // ----------------------------------------------------
  // 1. LOGIN FORM LOGIC
  // ----------------------------------------------------
  const { 
    register: registerLogin, 
    handleSubmit: handleLoginSubmit, 
    formState: { isSubmitting: isLoginSubmitting } 
  } = useForm<LoginFormData>()

  const onLoginSubmit = async (data: LoginFormData) => {
    try {
      const result = await signInAction(data)
      if (result.ok) {
        await update();

        if (!callbackUrl) {
          toast.success("Successfully signed in!", {
            duration: 5000 // Optional: Set a reasonable default duration (5s)
          })
        } else {
          console.log("callback url is:", callbackUrl);
          router.push(callbackUrl);
        }
      } else {
        toast.error("Incorrect credentials")
      }
    } catch (error) {
      toast.error("Server side error.")
    }
  }

  // ----------------------------------------------------
  // 2. REGISTER FORM LOGIC
  // ----------------------------------------------------
  const { 
    register: registerSignUp, 
    handleSubmit: handleSignUpSubmit, 
    watch: watchSignUp,
    formState: { errors: signUpErrors, isSubmitting: isSignUpSubmitting }
  } = useForm<RegisterFormData>()

  // Watch password field to update strength meter in real-time
  const signUpPasswordValue = watchSignUp("password", "")

  const onRegisterSubmit = async (data: RegisterFormData) => {
    try {
        const result = await signUpAction(data);
        if (result?.error) {
          toast.error(result.error);
        } else {
            toast.success('Account created successfully');
            setVerificationSent(!!result?.verificationSent);
            setSignupEmail(data.email);
            // Move to success step or login step
            setStep("success");
        }
    } catch (error) {
        console.error(error);
        toast.error('Registration failed. Please try again later, or contact support.');
    }
  };

  // ----------------------------------------------------
  // HELPER FUNCTIONS
  // ----------------------------------------------------
  
  // Simulated handler for steps that don't have backend logic yet (Forgot Pass)
  const [isSimulatedLoading, setIsSimulatedLoading] = useState(false)
  const handleGenericSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSimulatedLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    
    if (step === "forgot-password") setStep("reset-password")
    else if (step === "reset-password") setStep("success")
    else if (step === "otp") setStep("success")
    
    setIsSimulatedLoading(false)
  }

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode)
    setStep(newMode)
  }

  const getPasswordStrength = (password: string) => {
    const passedRequirements = passwordRequirements.filter((req) => req.test(password || "")).length
    if (passedRequirements === 0) return { strength: 0, label: "", color: "" }
    if (passedRequirements <= 2) return { strength: 25, label: "Weak", color: "bg-red-500" }
    if (passedRequirements <= 3) return { strength: 50, label: "Fair", color: "bg-yellow-500" }
    if (passedRequirements <= 4) return { strength: 75, label: "Good", color: "bg-blue-500" }
    return { strength: 100, label: "Strong", color: "bg-green-500" }
  }

  const getCardHeight = () => {
    switch (step) {
      case "login": return "h-[470px]"
      case "signup": return signUpPasswordValue ? "h-[670px]" : "h-[530px]"
      case "forgot-password": return "h-[380px]"
      case "reset-password": return "h-[520px]"
      case "otp": return "h-[380px]"
      case "success": return "h-[320px]"
      default: return "h-[480px]"
    }
  }

  const passwordStrength = getPasswordStrength(signUpPasswordValue)

  return (
    <div className={`w-full max-w-135 transition-all duration-700 ease-out ${getCardHeight()}`}>
      <div className="relative h-full">
        {/* Glass morphism card */}
        <div className="absolute inset-0 bg-white/5 backdrop-blur-none rounded-3xl border border-white/20 shadow-2xl">
          <div className="absolute inset-0 bg-linear-to-br from-white/20 via-white/10 to-transparent rounded-3xl" />
        </div>

        {/* Content */}
        <div className="relative h-full p-8 flex flex-col">
          
          {/* ================= LOGIN STEP ================= */}
          {step === "login" && (
            <div className="flex-1 flex flex-col justify-center space-y-6">
              <div className="text-center space-y-2">
                <p className="text-3xl xs:text-4xl font-semibold text-white">Welcome Back</p>
                <p className="text-white/70">Sign in to your account</p>
              </div>

              <form onSubmit={handleLoginSubmit(onLoginSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-username" className="text-white/90">Identifier</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                    <Input
                      id="login-username"
                      type="text"
                      {...registerLogin("identifier", { required: true })}
                      className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20"
                      placeholder="Enter your username or email"
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-white/90">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      {...registerLogin("password", { required: true })}
                      className="pl-10 pr-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20"
                      placeholder="Enter your password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/70"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setStep("forgot-password")}
                    className="text-white/70 hover:text-white text-sm transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={isLoginSubmitting}
                  className="w-full bg-white/20 hover:bg-white/30 text-white border border-white/30 hover:border-white/40 h-11 rounded-xl font-medium transition-all duration-200 backdrop-blur-xs"
                >
                  {isLoginSubmitting ? "Signing in..." : "Sign In"}
                </Button>
              </form>

              <div className="text-center">
                <button
                  onClick={() => switchMode("signup")}
                  className="text-white/70 hover:text-white text-sm transition-colors"
                >
                  {"Don't have an account? Sign up"}
                </button>
              </div>
            </div>
          )}

          {/* ================= SIGNUP STEP ================= */}
          {step === "signup" && (
            <div className="flex-1 flex flex-col justify-center space-y-6">
              <div className="text-center space-y-2">
                <p className="text-4xl font-semibold text-white">Create Account</p>
                <p className="text-white/70">Join us today</p>
              </div>

              <form onSubmit={handleSignUpSubmit(onRegisterSubmit)} className="space-y-4">
                
                {/* Username Field */}
                <div className="space-y-2">
                  <Label htmlFor="signup-username" className="text-white/90">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                    <Input
                      id="signup-username"
                      type="text"
                      {...registerSignUp("username", { required: "Username is required" })}
                      className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20"
                      placeholder="Choose a username"
                    />
                  </div>
                  {signUpErrors.username && (
                    <span className="text-xs text-red-400 pl-1">{signUpErrors.username.message}</span>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-white/90">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                    <Input
                      id="signup-email"
                      type="email"
                      {...registerSignUp("email", { 
                        required: "Email is required",
                        // pattern: { value: /\S+@\S+\.\S+/, message: "Invalid email" }
                      })}
                      className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20"
                      placeholder="Enter your email"
                    />
                  </div>
                  {signUpErrors.email && (
                    <span className="text-xs text-red-400 pl-1">{signUpErrors.email.message}</span>
                  )}
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-white/90">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      {...registerSignUp("password", { 
                        required: "Password is required",
                        minLength: { value: 9, message: "Must be at least 9 characters" }
                      })}
                      className="pl-10 pr-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20"
                      placeholder="Create a password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/70"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  {signUpErrors.password && (
                     <p className="text-xs text-red-400 pl-1">{signUpErrors.password.message}</p>
                  )}

                  {/* Password Strength Meter */}
                  {signUpPasswordValue && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/60">Password strength</span>
                        <span
                          className={`text-xs font-medium ${
                            passwordStrength.strength === 100 ? "text-white/90" : 
                            passwordStrength.strength >= 50 ? "text-white/70" : "text-white/50"
                          }`}
                        >
                          {passwordStrength.label}
                        </span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${passwordStrength.color}`}
                          style={{ width: `${passwordStrength.strength}%` }}
                        />
                      </div>
                      <div className="space-y-1 pt-1">
                        {passwordRequirements.map((req, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                req.test(signUpPasswordValue) ? "bg-white/80" : "bg-white/20"
                              }`}
                            />
                            <span
                              className={`text-xs ${req.test(signUpPasswordValue) ? "text-white/80" : "text-white/40"}`}
                            >
                              {req.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isSignUpSubmitting}
                  className="w-full bg-white/20 hover:bg-white/30 text-white border border-white/30 hover:border-white/40 h-11 rounded-xl font-medium transition-all duration-200 backdrop-blur-xs disabled:opacity-50"
                >
                  {isSignUpSubmitting ? "Creating account..." : "Sign Up"}
                </Button>
              </form>

              <div className="text-center">
                <button
                  onClick={() => switchMode("login")}
                  className="text-white/70 hover:text-white text-sm transition-colors"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </div>
          )}

          {/* ================= FORGOT PASSWORD (UI ONLY) ================= */}
          {step === "forgot-password" && (
            <div className="flex-1 flex flex-col justify-center space-y-6">
              <button
                onClick={() => setStep("login")}
                className="absolute top-6 left-6 text-white/70 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-semibold text-white">Reset Password</h1>
                <p className="text-white/70">Enter your email to receive reset instructions</p>
              </div>
              <form onSubmit={handleGenericSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email" className="text-white/90">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                    <Input id="reset-email" type="email" className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50" placeholder="Enter your email" required />
                  </div>
                </div>
                <Button type="submit" disabled={isSimulatedLoading} className="w-full bg-white/20 hover:bg-white/30 text-white border border-white/30 h-11 rounded-xl backdrop-blur-xs">
                  {isSimulatedLoading ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>
            </div>
          )}

          {/* ================= SUCCESS STEP ================= */}
          {step === "success" && (
            <div className="flex-1 flex flex-col justify-center items-center space-y-6">
              <button
                onClick={() => setStep("login")}
                className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="w-16 h-16 bg-white/20 backdrop-blur-xs border border-white/30 rounded-full flex items-center justify-center">
                <Check className="w-8 h-8 text-white" />
              </div>
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-semibold text-white">
                  {mode === "signup" ? "Account created" : "Success!"}
                </h1>
                {mode === "signup" ? (
                  <p className="text-white/70">
                    {verificationSent ? (
                      <>
                        We sent a verification link to{" "}
                        <span className="text-white">{signupEmail}</span>. Confirm
                        it within 24 hours to verify your email.
                      </>
                    ) : (
                      <>Your account is ready — you can sign in now.</>
                    )}
                  </p>
                ) : (
                  <p className="text-white/70">Action completed.</p>
                )}
              </div>
              <Button
                onClick={() => setStep("login")}
                className="w-full bg-white/20 hover:bg-white/30 text-white border border-white/30 hover:border-white/40 h-11 rounded-xl font-medium transition-all duration-200 backdrop-blur-xs"
              >
                Return to Login
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}