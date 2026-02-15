import { useEffect, useState } from "react";
import type { ApiResponse, Project } from "@elruso/types";
import { apiFetch } from "../api";
import { useSelectedProject } from "../projectStore";
import { humanizeProfileId } from "../humanize";

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

  if (loading) {
    return (
      <div className="p-6 text-gray-400">Cargando proyectos...</div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Proyectos</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
        >
          Nuevo proyecto
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded px-4 py-2 mb-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Create project modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-bold mb-4">Nuevo proyecto</h2>

            {/* Name */}
            <label className="block text-sm text-gray-400 mb-1">Nombre</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej: Mi tienda, Soporte WhatsApp..."
              autoFocus
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none mb-4"
            />

            {/* Profile selector */}
            <label className="block text-sm text-gray-400 mb-2">Perfil</label>
            <div className="space-y-2 mb-5">
              {PROFILE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setNewProfile(opt.value)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    newProfile === opt.value
                      ? "bg-indigo-900/30 border-indigo-500"
                      : "bg-gray-800 border-gray-700 hover:border-gray-500"
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-gray-400">{opt.desc}</div>
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setNewName("");
                  setNewProfile("open");
                  setError(null);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
              >
                {creating ? "Creando..." : "Crear y configurar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project list */}
      <div className="space-y-2">
        {projects.map((p) => {
          const isSelected = selectedProject?.id === p.id;
          return (
            <div
              key={p.id}
              onClick={() => handleSelect(p)}
              className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors ${
                isSelected
                  ? "border-blue-500 bg-blue-900/30"
                  : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
              }`}
            >
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {humanizeProfileId(p.profile)} &middot; {new Date(p.created_at).toLocaleDateString("es-AR")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!p.is_active && (
                  <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">Inactivo</span>
                )}
                {isSelected && (
                  <span className="text-xs bg-blue-600 px-2 py-0.5 rounded">Seleccionado</span>
                )}
              </div>
            </div>
          );
        })}

        {projects.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No hay proyectos. Crea uno para comenzar.</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
            >
              Nuevo proyecto
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
