import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'

export function Landing() {
  return (
    <>
      <Helmet>
        <title>FantasyFooty — Play Fantasy Football Across 5 Leagues</title>
        <meta
          name="description"
          content="Pick your squad from the Premier League, La Liga, Serie A, Bundesliga, and Ligue 1. Earn points every week. Play free."
        />
        <meta property="og:title" content="FantasyFooty" />
        <meta
          property="og:description"
          content="Season-long fantasy football across Europe's top 5 leagues. Free to play."
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="min-h-screen bg-game-bg flex flex-col items-center justify-center px-6 text-center">
        {/* Logo */}
        <div className="mb-6 flex items-center gap-3">
          <span
            className="text-6xl"
            style={{ filter: 'drop-shadow(0 0 20px rgba(0,255,135,0.6))' }}
          >
            ⚽
          </span>
          <h1 className="font-bangers text-6xl tracking-widest text-white">
            FANTASY<span className="text-game-neon">FOOTY</span>
          </h1>
        </div>

        {/* Tagline */}
        <p className="text-slate-400 text-xl font-nunito max-w-md mb-2">
          5 leagues. One squad. Season-long glory.
        </p>
        <p className="text-slate-500 text-base font-nunito max-w-sm mb-10">
          Premier League · La Liga · Serie A · Bundesliga · Ligue 1
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs sm:max-w-sm">
          <Link to="/register" className="btn-primary w-full sm:w-auto flex-1 text-center text-lg py-3">
            Play Free
          </Link>
          <Link
            to="/login"
            className="btn-secondary w-full sm:w-auto flex-1 text-center text-lg py-3"
          >
            Sign In
          </Link>
        </div>
      </div>
    </>
  )
}
