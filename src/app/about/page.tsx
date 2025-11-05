import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
// pnpm dlx shadcn@latest add
const About = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url('/images/temple-autumn.jpg')`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-background"></div>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <Badge className="mb-6 bg-primary/20 text-primary border-primary/30 font-heading text-sm">
            Our Philosophy
          </Badge>
          <h1 className="text-5xl md:text-6xl font-heading font-bold text-white mb-6 leading-tight">
            The Purpose of Compete Math
          </h1>
          <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
            Advancing mathematical understanding through community-driven problem solving and algorithmic innovation
          </p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-4xl font-heading font-bold text-foreground">Our Mission</h2>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Compete Math exists to share fascinating mathematical problems discovered through rigorous study and
                research. We encourage the sharing of creative solutions and foster competition to develop more
                efficient algorithms.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Our problems are designed to be solved computationally, preventing simple guessing while encouraging
                deep mathematical insight. While the core concepts can be understood with pen and paper, coding helps
                reveal patterns and test hypotheses.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Inspired by</span>
                <a
                  href="https://projecteuler.net/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Project Euler
                </a>
                <span className="text-muted-foreground">but with original problems</span>
              </div>
            </div>

            <div className="relative">
              <div
                className="aspect-square rounded-2xl bg-cover bg-center shadow-2xl"
                style={{
                  backgroundImage: `url('/images/purple-balcony.gif')`,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent rounded-2xl"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Target Audience Section */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-6">
              Who Are These Problems For?
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Mathematical challenges designed for curious minds at every level of expertise
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <Card className="p-6 text-center hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🎓</span>
                </div>
                <h3 className="text-xl font-heading font-semibold mb-3 text-foreground">Students</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Curious high schoolers and university students looking to challenge their mathematical thinking
                </p>
              </CardContent>
            </Card>

            <Card className="p-6 text-center hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">💡</span>
                </div>
                <h3 className="text-xl font-heading font-semibold mb-3 text-foreground">Professionals</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Working mathematicians, engineers, and developers seeking intellectual stimulation
                </p>
              </CardContent>
            </Card>

            <Card className="p-6 text-center hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🏆</span>
                </div>
                <h3 className="text-xl font-heading font-semibold mb-3 text-foreground">Experts</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Seasoned problem solvers looking for cutting-edge mathematical challenges
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="bg-card rounded-2xl p-8 border">
            <h3 className="text-2xl font-heading font-semibold text-foreground mb-6">Key Principles</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-3 flex-shrink-0"></div>
                <div>
                  <h4 className="font-semibold text-foreground mb-1">No Advanced Theory Required</h4>
                  <p className="text-muted-foreground">
                    All challenges can be solved with creativity and investigation, not specialized knowledge
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-accent rounded-full mt-3 flex-shrink-0"></div>
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Competition Mathematics Focus</h4>
                  <p className="text-muted-foreground">
                    Problems emphasize algorithmic efficiency with sub-second runtime expectations
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-3 flex-shrink-0"></div>
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Progressive Difficulty</h4>
                  <p className="text-muted-foreground">
                    Problems are ordered by complexity, allowing natural skill progression
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-accent rounded-full mt-3 flex-shrink-0"></div>
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Fun and Engaging</h4>
                  <p className="text-muted-foreground">
                    Above all, the key is to enjoy the process of mathematical discovery
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Getting Started Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="relative">
              <div
                className="aspect-video rounded-2xl bg-cover bg-center shadow-2xl"
                style={{
                  backgroundImage: `url('/images/mystical-moon.png')`,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent rounded-2xl"></div>
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-4xl font-heading font-bold text-foreground">How to Get Started</h2>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Join our community completely free and begin your mathematical journey today
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-sm font-heading font-bold text-primary">1</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">Create Your Account</h4>
                    <p className="text-muted-foreground">
                      <Link href="/auth/register" className="text-primary hover:text-primary/80 font-medium">
                        Register
                      </Link>{" "}
                      for free to track your progress and submit solutions
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-sm font-heading font-bold text-accent">2</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">Explore Problems</h4>
                    <p className="text-muted-foreground">
                      Browse our{" "}
                      <Link href="/archives" className="text-primary hover:text-primary/80 font-medium">
                        Archives
                      </Link>{" "}
                      to find challenges that match your skill level
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-sm font-heading font-bold text-primary">3</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">Submit & Compete</h4>
                    <p className="text-muted-foreground">
                      <Link href="/auth/login" className="text-primary hover:text-primary/80 font-medium">
                        Login
                      </Link>{" "}
                      to submit solutions and compete with the community
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  asChild
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-heading text-lg px-8 py-4"
                >
                  <Link href="/auth/register">Start Solving Problems</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Rate Limiting Info */}
      <section className="py-16 px-6 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <Card className="p-8 border-l-4 border-l-destructive">
            <CardContent className="p-0">
              <h3 className="text-2xl font-heading font-semibold text-foreground mb-4">Rate Limiting Information</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                If our systems detect unusual activity, you'll be limited to submitting answers at a rate of one every
                10 seconds. This limitation is automatically lifted 24 hours after the last detected offense.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Prevention tip:</strong> Minimize guessing and only submit answers
                when you're confident in your solution.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h3 className="text-3xl font-heading font-semibold text-foreground mb-4">Get in Touch</h3>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Have a problem to share? Feedback to provide? We'd love to hear from you.
          </p>
          <Button asChild variant="outline" size="lg" className="font-heading bg-transparent">
            <a href="mailto:bashir.mikael@outlook.com">Contact Compete Math</a>
          </Button>
        </div>
      </section>
    </div>
  )
}

export default About
