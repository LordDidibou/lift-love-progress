import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Dumbbell, TrendingUp, ListChecks, Zap } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { canOpenOfflineApp } from "@/lib/offline";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 bg-gradient-hero" />
      <div className="absolute inset-x-0 top-0 h-[600px] bg-[radial-gradient(ellipse_at_top,oklch(0.88_0.22_130/0.15),transparent_70%)]" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-primary shadow-glow">
            <Dumbbell className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-2xl font-bold tracking-tight">FORGE</span>
        </div>
        <Link
          to="/auth"
          className="rounded-md border border-border bg-secondary/50 px-4 py-2 text-sm font-semibold hover:bg-secondary"
        >
          Se connecter
        </Link>
      </header>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-16 pb-24 text-center md:pt-28">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          <Zap className="h-3 w-3" /> Suivi de musculation nouvelle génération
        </span>
        <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
          Forge ton corps.
          <br />
          <span className="text-gradient">Track chaque rep.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Logger tes séances en quelques tap, suivre ta progression série après série, et battre tes records.
          Inspiré des meilleurs, conçu pour la salle.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            to="/auth"
            className="rounded-lg bg-gradient-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-glow transition-transform hover:scale-[1.02]"
          >
            Commencer gratuitement
          </Link>
        </div>
      </section>

      <section className="relative z-10 mx-auto grid max-w-5xl gap-4 px-6 pb-24 md:grid-cols-3">
        {[
          {
            icon: Dumbbell,
            title: "Logger ultra-rapide",
            desc: "Saisis tes séries en quelques tap. Bibliothèque de 50+ exercices + tes propres ajouts.",
          },
          {
            icon: ListChecks,
            title: "Tes programmes",
            desc: "Crée tes routines, lance-les en un clic. Push/Pull/Legs, full body, à toi de voir.",
          },
          {
            icon: TrendingUp,
            title: "Stats motivantes",
            desc: "Volume total, records personnels, courbes de progression par exercice.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-border bg-card p-6 shadow-card transition-colors hover:border-primary/40"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
