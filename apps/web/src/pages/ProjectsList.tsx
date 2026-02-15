import { useEffect, useState } from "react";
import type { ApiResponse, Project } from "@elruso/types";
import { apiFetch } from "../api";
import { useSelectedProject } from "../projectStore";
import { humanizeProfileId } from "../humanize";
import {
  PageContainer,
  GlassCard,
  GlowButton,
  StatusPill,
  SectionBlock,
  HeroPanel,
  AnimatedFadeIn,
  Modal2026,
} from "../ui2026";

const PROFILE_OPTIONS = [
  { value: "open", label: "Abierto", desc: "Para cualquier proyecto. El sistema se adapta a lo que necesites." },
  { value: "tiendanube", label: "Tiendanube", desc: "E-commerce con Tiendanube." },
  { value: "waba", label: "WhatsApp API", desc: "Integracion con WhatsApp Business API." },
];

export function ProjectsList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProfile, setNewProfile] = useState("open");
  const [selectedProject, setSelectedProject] = useSelectedProject();
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchProjects = () => {
    setLoading(true);
    apiFetch("/api/ops/projects")
      .then((r) => r.json())
      .then((data: ApiResponse<Project[]>) => {
        if (data.ok && data.data) {
          setProjects(data.data);
          // Auto-select if only one project and none selected
          if (!selectedProject && data.data.length === 1) {
            setSelectedProject({ id: data.data[0].id, name: data.data[0].name });
          }
        } else {
          setError(data.error ?? "Error cargando proyectos");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch("/api/ops/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), profile: newProfile }),
      });
      const data: ApiResponse<Project> = await res.json();
      if (data.ok && data.data) {
        setNewName("");
        setNewProfile("open");
        setShowModal(false);
        setSelectedProject({ id: data.data.id, name: data.data.name });
        // Navigate to wizard for the new project
        window.location.hash = "#/strategy-wizard";
      } else {
        setError(data.error ?? "Error creando proyecto");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = (project: Project) => {
    setSelectedProject({ id: project.id, name: project.name });
    window.location.hash = "#/";
  };

  const handleDelete = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    if (deleting) return;
    if (!window.confirm(`Eliminar "${project.name}"? Esta accion no se puede deshacer.`)) return;
    setDeleting(project.id);
    try {
      const res = await apiFetch(`/api/ops/projects/${project.id}`, { method: "DELETE" });
      const data: ApiResponse<{ deleted: boolean }> = await res.json();
      if (data.ok) {
        if (selectedProject?.id === project.id) {
          setSelectedProject(null);
        }
        fetchProjects();
      } else {
        setError(data.error ?? "Error eliminando proyecto");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <PageContainer maxWidth="md">
        <div className="text-slate-400">Cargando proyectos...</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="md">
      <HeroPanel
        title="Proyectos"
        actions={
          <GlowButton variant="primary" size="md" onClick={() => setShowModal(true)}>
            Nuevo proyecto
          </GlowButton>
        }
      />

      {error && (
        <AnimatedFadeIn>
          <div className="bg-red-900/30 border border-red-700/50 rounded-card px-4 py-2.5 mb-4 text-sm text-red-300">
            {error}
          </div>
        </AnimatedFadeIn>
      )}

      {/* Create project modal */}
      <Modal2026
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setNewName("");
          setNewProfile("open");
          setError(null);
        }}
        title="Nuevo proyecto"
        maxWidth="max-w-md"
      >
        {/* Name */}
        <label className="block text-sm text-slate-400 mb-1">Nombre</label>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Ej: Mi tienda, Soporte WhatsApp..."
          autoFocus
          className="w-full bg-elevated border border-[rgba(148,163,184,0.08)] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none mb-4"
        />

        {/* Profile selector */}
        <label className="block text-sm text-slate-400 mb-2">Perfil</label>
        <div className="space-y-2 mb-5">
          {PROFILE_OPTIONS.map((opt) => (
            <GlassCard
              key={opt.value}
              hover
              glow={newProfile === opt.value ? "primary" : "none"}
              onClick={() => setNewProfile(opt.value)}
              className="!p-3"
            >
              <div className="text-sm font-medium text-white">{opt.label}</div>
              <div className="text-xs text-slate-400">{opt.desc}</div>
            </GlassCard>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <GlowButton
            variant="secondary"
            size="md"
            onClick={() => {
              setShowModal(false);
              setNewName("");
              setNewProfile("open");
              setError(null);
            }}
          >
            Cancelar
          </GlowButton>
          <GlowButton
            variant="primary"
            size="md"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="flex-1"
          >
            {creating ? "Creando..." : "Crear y configurar"}
          </GlowButton>
        </div>
      </Modal2026>

      {/* Project list */}
      <SectionBlock>
        <div className="space-y-2">
          {projects.map((p, i) => {
            const isSelected = selectedProject?.id === p.id;
            return (
              <AnimatedFadeIn key={p.id} delay={i * 50}>
                <GlassCard
                  hover
                  glow={isSelected ? "primary" : "none"}
                  onClick={() => handleSelect(p)}
                  className="!p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white">{p.name}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {humanizeProfileId(p.profile)} &middot; {new Date(p.created_at).toLocaleDateString("es-AR")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!p.is_active && (
                        <StatusPill status="offline" label="Inactivo" />
                      )}
                      {isSelected && (
                        <StatusPill status="active" label="Seleccionado" />
                      )}
                      <GlowButton
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleDelete(e as React.MouseEvent, p)}
                        disabled={deleting === p.id}
                        className="text-slate-500 hover:text-red-400 hover:bg-red-900/20"
                      >
                        {deleting === p.id ? "..." : "Eliminar"}
                      </GlowButton>
                    </div>
                  </div>
                </GlassCard>
              </AnimatedFadeIn>
            );
          })}

          {projects.length === 0 && (
            <AnimatedFadeIn>
              <div className="text-center py-8">
                <p className="text-slate-500 mb-4">No hay proyectos. Crea uno para comenzar.</p>
                <GlowButton variant="primary" size="md" onClick={() => setShowModal(true)}>
                  Nuevo proyecto
                </GlowButton>
              </div>
            </AnimatedFadeIn>
          )}
        </div>
      </SectionBlock>
    </PageContainer>
  );
}
