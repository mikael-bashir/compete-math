'use client'

import { AtomixGlass } from '@shohojdhara/atomix'
import { Sparkles, Layers, Zap, Shield } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Vibrant Background */}
      <div className="fixed inset-0 -z-10">
        <img
          src="/images/true-masterpiece.png"
          alt="Background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0" />
      </div>

      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <section className="mb-24 flex justify-center">
          <AtomixGlass
            mode="standard"
            displacementScale={70}
            blurAmount={0.2}
            saturation={140}
            aberrationIntensity={0.2}
            elasticity={0}
            cornerRadius={15}
            className="max-w-2xl"
          >
            <div className="p-12 text-center">
              <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-2xl shadow-violet-500/50">
                <Sparkles className="w-12 h-12 text-white" />
              </div>
              
              <h1 className="text-5xl font-bold mb-4 bg-gradient-to-br from-white to-white/80 bg-clip-text text-transparent">
                AtomixGlass
              </h1>
              
              <p className="text-lg text-white/90 mb-8 leading-relaxed">
                A premium glass morphism component with realistic light refraction, chromatic aberration,
                and interactive effects. Perfect for modern, elegant UI designs.
              </p>

              <div className="flex gap-3 justify-center flex-wrap">
                <button className="px-6 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl font-semibold text-white transition-all border border-white/30">
                  Get Started
                </button>
                <button className="px-6 py-3 bg-transparent hover:bg-white/10 backdrop-blur-sm rounded-xl font-semibold text-yellow-300 transition-all border border-yellow-300/50">
                  View Docs
                </button>
              </div>

              <div className="flex gap-4 justify-center flex-wrap mt-8 pt-8 border-t border-white/10">
                {[
                  { label: 'Performance', value: '⚡ Optimized' },
                  { label: 'Quality', value: '💎 Premium' },
                  { label: 'Compatibility', value: '🌐 Universal' }
                ].map((item) => (
                  <div
                    key={item.label}
                    className="text-center px-4 py-2 rounded-xl bg-white/5 backdrop-blur-sm"
                  >
                    <div className="text-xs text-white/70 mb-1">{item.label}</div>
                    <div className="text-sm font-semibold text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </AtomixGlass>
        </section>

        {/* Modes Section */}
        <section className="mb-24">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">Four Rendering Modes</h2>
            <p className="text-xl text-white/80">
              Explore four distinct rendering modes, each optimized for different visual styles
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Standard Mode */}
            <AtomixGlass
              mode="standard"
              displacementScale={150}
              blurAmount={0.2}
              aberrationIntensity={2}
              cornerRadius={20}
            >
              <div className="p-8">
                <div className="w-16 h-16 mb-6 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-3">Standard</h3>
                <p className="text-white/80 mb-6 leading-relaxed">
                  Balanced glass effect with optimal displacement and aberration
                </p>

                <div className="flex gap-3 flex-wrap">
                  <span className="px-3 py-1 rounded-lg bg-white/10 backdrop-blur-sm text-sm text-white/90 font-mono">
                    Disp: 150
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-white/10 backdrop-blur-sm text-sm text-white/90 font-mono">
                    Blur: 12
                  </span>
                </div>
              </div>
            </AtomixGlass>

            {/* Polar Mode */}
            <AtomixGlass
              mode="polar"
              displacementScale={120}
              blurAmount={0.2}
              aberrationIntensity={2}
              cornerRadius={20}
            >
              <div className="p-8">
                <div className="w-16 h-16 mb-6 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                  <Layers className="w-8 h-8 text-white" />
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-3">Polar</h3>
                <p className="text-white/80 mb-6 leading-relaxed">
                  Circular refraction pattern that follows your cursor
                </p>

                <div className="flex gap-3 flex-wrap">
                  <span className="px-3 py-1 rounded-lg bg-white/10 backdrop-blur-sm text-sm text-white/90 font-mono">
                    Disp: 120
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-white/10 backdrop-blur-sm text-sm text-white/90 font-mono">
                    Blur: 12
                  </span>
                </div>
              </div>
            </AtomixGlass>

            {/* Prominent Mode */}
            <AtomixGlass
              mode="prominent"
              displacementScale={100}
              blurAmount={0.2}
              aberrationIntensity={2}
              cornerRadius={20}
            >
              <div className="p-8">
                <div className="w-16 h-16 mb-6 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-3">Prominent</h3>
                <p className="text-white/80 mb-6 leading-relaxed">
                  Enhanced displacement with stronger edge effects
                </p>

                <div className="flex gap-3 flex-wrap">
                  <span className="px-3 py-1 rounded-lg bg-white/10 backdrop-blur-sm text-sm text-white/90 font-mono">
                    Disp: 100
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-white/10 backdrop-blur-sm text-sm text-white/90 font-mono">
                    Blur: 12
                  </span>
                </div>
              </div>
            </AtomixGlass>

            {/* Shader Mode */}
            <AtomixGlass
              mode="shader"
              displacementScale={190}
              blurAmount={0.2}
              aberrationIntensity={2}
              cornerRadius={20}
            >
              <div className="p-8">
                <div className="w-16 h-16 mb-6 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                  <Shield className="w-8 h-8 text-white" />
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-3">Shader</h3>
                <p className="text-white/80 mb-6 leading-relaxed">
                  Advanced shader-based displacement for maximum impact
                </p>

                <div className="flex gap-3 flex-wrap">
                  <span className="px-3 py-1 rounded-lg bg-white/10 backdrop-blur-sm text-sm text-white/90 font-mono">
                    Disp: 190
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-white/10 backdrop-blur-sm text-sm text-white/90 font-mono">
                    Blur: 12
                  </span>
                </div>
              </div>
            </AtomixGlass>
          </div>
        </section>

        {/* Pricing Example */}
        <section className="mb-24">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">Perfect for Pricing Cards</h2>
            <p className="text-xl text-white/80">
              Elevate your pricing sections with premium glass effects
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              { name: 'Starter', price: '$29', features: ['10 Projects', '5GB Storage', 'Basic Support'] },
              { name: 'Pro', price: '$79', features: ['Unlimited Projects', '100GB Storage', 'Priority Support', 'Advanced Analytics'], highlight: true },
              { name: 'Enterprise', price: '$199', features: ['Unlimited Everything', 'Dedicated Support', 'Custom Integrations'] }
            ].map((plan) => (
              <AtomixGlass
                key={plan.name}
                mode={plan.highlight ? 'polar' : 'standard'}
                displacementScale={plan.highlight ? 180 : 120}
                aberrationIntensity={plan.highlight ? 3 : 2}
                cornerRadius={16}
              >
                <div className="p-8">
                  {plan.highlight && (
                    <div className="mb-4 -mt-4 -mx-8 px-4 py-2 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 border-b border-white/10">
                      <span className="text-xs font-semibold text-yellow-300">MOST POPULAR</span>
                    </div>
                  )}
                  
                  <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                  <div className="mb-6">
                    <span className="text-5xl font-bold text-white">{plan.price}</span>
                    <span className="text-white/70">/month</span>
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-white/90">
                        <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button className={`w-full py-3 rounded-xl font-semibold transition-all ${
                    plan.highlight 
                      ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white hover:shadow-xl hover:shadow-violet-500/50' 
                      : 'bg-white/10 text-white hover:bg-white/20 border border-white/30'
                  }`}>
                    Get Started
                  </button>
                </div>
              </AtomixGlass>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="flex justify-center">
          <AtomixGlass
            mode="polar"
            displacementScale={160}
            blurAmount={12}
            saturation={150}
            aberrationIntensity={3}
            elasticity={0.2}
            cornerRadius={24}
            className="max-w-4xl w-full"
          >
            <div className="p-16 text-center">
              <h2 className="text-4xl font-bold text-white mb-6">
                Ready to Elevate Your UI?
              </h2>
              <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto leading-relaxed">
                Install AtomixGlass today and bring Apple-quality liquid glass effects to your web applications.
                Performance-optimized, accessible, and stunning.
              </p>
              
              <div className="flex gap-4 justify-center flex-wrap">
                <button className="px-8 py-4 bg-white text-purple-900 hover:bg-white/90 rounded-xl font-bold text-lg transition-all shadow-xl">
                  npm install @shohojdhara/atomix
                </button>
                <button className="px-8 py-4 bg-transparent hover:bg-white/10 backdrop-blur-sm rounded-xl font-bold text-lg text-white transition-all border-2 border-white/40">
                  View Documentation
                </button>
              </div>
            </div>
          </AtomixGlass>
        </section>
      </div>
    </main>
  )
}
