import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { problems } from "../lib/constants/archives/problems"

export default function Archives() {
  const availableProblems = problems.filter((problem) => problem.name !== "coming soon!")
  const comingSoonCount = problems.filter((problem) => problem.name === "coming soon!").length

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url('/images/starry-night.gif')`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-background"></div>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <Badge className="mb-6 bg-primary/20 text-primary border-primary/30 font-heading text-sm">
            Problem Archive
          </Badge>
          <h1 className="text-5xl md:text-6xl font-heading font-bold text-white mb-6 leading-tight">The Archive</h1>
          <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
            Explore our collection of challenging mathematical problems designed to push the boundaries of algorithmic
            thinking
          </p>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <Card className="p-6 text-center hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="text-4xl font-heading font-bold text-primary mb-2">{availableProblems.length}</div>
                <p className="text-muted-foreground">Available Problems</p>
              </CardContent>
            </Card>

            <Card className="p-6 text-center hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="text-4xl font-heading font-bold text-accent mb-2">{comingSoonCount}</div>
                <p className="text-muted-foreground">Coming Soon</p>
              </CardContent>
            </Card>

            <Card className="p-6 text-center hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                <div className="text-4xl font-heading font-bold text-primary mb-2">Weekly</div>
                <p className="text-muted-foreground">Update Schedule</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Available Problems Section */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">Available Problems</h2>
            <p className="text-xl text-muted-foreground">
              Challenge yourself with these carefully crafted mathematical puzzles
            </p>
          </div>

          <div className="grid gap-6">
            {availableProblems.map((problem, index) => (
              <Card key={problem.id} className="group hover:shadow-xl transition-all duration-300 overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 w-24 h-24 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                      <span className="text-2xl font-heading font-bold text-primary">{problem.id}</span>
                    </div>

                    <div className="flex-1 p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-heading font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                            {problem.name}
                          </h3>
                          <div className="flex items-center gap-4">
                            <Badge variant="outline" className="text-xs">
                              Problem #{problem.id}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Difficulty: {index < 2 ? "Beginner" : index < 4 ? "Intermediate" : "Advanced"}
                            </span>
                          </div>
                        </div>

                        <Button
                          asChild
                          variant="outline"
                          className="group-hover:bg-primary group-hover:text-primary-foreground transition-all bg-transparent"
                        >
                          <Link href={problem.url}>Solve Problem</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Coming Soon Section */}
      <section className="py-16 px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">
              More Problems Coming Soon
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              We're constantly developing new challenges to expand your mathematical horizons
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {problems
              .filter((problem) => problem.name === "coming soon!")
              .slice(0, 6)
              .map((problem) => (
                <Card key={problem.id} className="p-6 opacity-60">
                  <CardContent className="p-0 text-center">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-lg font-heading font-bold text-muted-foreground">{problem.id}</span>
                    </div>
                    <h3 className="text-lg font-heading font-semibold text-muted-foreground mb-2">
                      Problem #{problem.id}
                    </h3>
                    <p className="text-sm text-muted-foreground">Coming Soon</p>
                  </CardContent>
                </Card>
              ))}
          </div>

          {comingSoonCount > 6 && (
            <div className="text-center mt-8">
              <p className="text-muted-foreground">And {comingSoonCount - 6} more problems in development...</p>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="relative mb-12">
            <div
              className="aspect-video rounded-2xl bg-cover bg-center shadow-2xl"
              style={{
                backgroundImage: `url('/images/night-water.gif')`,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent rounded-2xl flex items-center justify-center">
                <div className="text-center text-white">
                  <h2 className="text-4xl md:text-5xl font-heading font-bold mb-4">Ready to Start?</h2>
                  <p className="text-xl opacity-90 max-w-2xl">
                    Create an account to track your progress and submit solutions
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-heading text-lg px-8 py-4"
            >
              <Link href="/auth/register">Create Account</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="font-heading text-lg px-8 py-4 bg-transparent">
              <Link href="/auth/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
