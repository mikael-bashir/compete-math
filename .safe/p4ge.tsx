import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"

const Home = () => {
  return (
    <div className="min-h-screen bg-background">
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <Image
          src="/images/sunset-fireworks.gif"
          alt="Sunset with fireworks over a body of water"
          fill
          style={{ objectFit: 'cover' }}
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/10 to-background" />

        <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
          <Badge className="mb-6 bg-primary/20 text-primary border-primary/30 font-heading text-sm">
            Frontier of Mathematical AI
          </Badge>
          <h1 className="text-5xl md:text-7xl font-heading font-bold text-white mb-6 leading-tight">Compete Math</h1>
          <p className="text-xl md:text-2xl text-white/90 mb-8 font-sans leading-relaxed max-w-2xl mx-auto">
            Where brilliant minds meet cutting-edge AI to solve the most challenging mathematical problems
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-heading text-lg px-8 py-4"
            >
              <Link href="/auth/register">Start Your Journey</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/30 text-white hover:bg-white/10 font-heading text-lg px-8 py-4 bg-transparent"
            >
              <Link href="/archives">Explore Problems</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-6">Our Mission</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Advancing the frontier of mathematical problem-solving through community-driven competitions and
              AI-powered insights
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <Card className="p-6 border-l-4 border-l-primary">
                <CardContent className="p-0">
                  <h3 className="text-2xl font-heading font-semibold text-foreground mb-3">Creative Problem Solving</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Share innovative solutions and compete to create more efficient algorithms. Every problem is
                    designed to challenge your mathematical intuition and computational thinking.
                  </p>
                </CardContent>
              </Card>

              <Card className="p-6 border-l-4 border-l-accent">
                <CardContent className="p-0">
                  <h3 className="text-2xl font-heading font-semibold text-foreground mb-3">
                    Machine-Verified Solutions
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Problems are designed to be solved computationally, preventing guessing while encouraging deep
                    mathematical understanding and pattern recognition.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="relative">
              <div className="relative aspect-square overflow-hidden rounded-2xl shadow-2xl">
                <Image
                  src="/images/autumn-tree.gif" // <-- Put the path to your GIF here
                  alt="Descriptive text for your animation"
                  fill
                  style={{ objectFit: 'cover' }}
                  unoptimized // <-- This is essential for GIFs to play correctly
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="relative">
              <div
                className="aspect-video rounded-2xl bg-cover bg-center shadow-2xl"
                style={{
                  backgroundImage: `url('/images/night-water.gif')`,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent rounded-2xl"></div>
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground">
                For Every Mathematical Mind
              </h2>
              <p className="text-xl text-muted-foreground leading-relaxed">
                From curious high school students to seasoned experts, our problems are designed to challenge and reward
                mathematical creativity at every level.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-3 flex-shrink-0"></div>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">No advanced theory required</strong> - creativity and
                    investigation are your primary tools
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-accent rounded-full mt-3 flex-shrink-0"></div>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">Competition mathematics focus</strong> - efficient algorithms
                    under 1 second runtime
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-3 flex-shrink-0"></div>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">Progressive difficulty</strong> - start with fundamentals,
                    advance to frontier challenges
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="relative mb-12">
            <div
              className="aspect-video rounded-2xl bg-cover bg-center shadow-2xl"
              style={{
                backgroundImage: `url('/images/starry-night.gif')`,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent rounded-2xl flex items-center justify-center">
                <div className="text-center text-white">
                  <h2 className="text-4xl md:text-5xl font-heading font-bold mb-4">Ready to Begin?</h2>
                  <p className="text-xl opacity-90 max-w-2xl">
                    Join our community of mathematical innovators and start solving problems that push the boundaries of
                    AI and mathematics
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <Card className="p-6 text-center hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-heading font-bold text-primary">1</span>
                </div>
                <h3 className="text-xl font-heading font-semibold mb-2">Create Account</h3>
                <p className="text-muted-foreground">Sign up completely free and join our community</p>
              </CardContent>
            </Card>

            <Card className="p-6 text-center hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-heading font-bold text-accent">2</span>
                </div>
                <h3 className="text-xl font-heading font-semibold mb-2">Explore Problems</h3>
                <p className="text-muted-foreground">Browse our archive of challenging mathematical problems</p>
              </CardContent>
            </Card>

            <Card className="p-6 text-center hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-heading font-bold text-primary">3</span>
                </div>
                <h3 className="text-xl font-heading font-semibold mb-2">Submit Solutions</h3>
                <p className="text-muted-foreground">Track your progress and compete with others</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-heading text-lg px-8 py-4"
            >
              <Link href="/auth/register">Join Compete Math</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="font-heading text-lg px-8 py-4 bg-transparent">
              <Link href="/archives">View Problems</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-muted/30">
        <div className="max-w-2xl mx-auto text-center">
          <h3 className="text-2xl font-heading font-semibold text-foreground mb-4">Questions or Feedback?</h3>
          <p className="text-muted-foreground mb-6">
            We'd love to hear from you. Share a problem, provide feedback, or just say hello.
          </p>
          <Button asChild variant="outline" size="lg" className="font-heading bg-transparent">
            <a href="mailto:bashir.mikael@outlook.com">Contact Us</a>
          </Button>
        </div>
      </section>
    </div>
  )
}

export default Home
