import { useEffect, useState } from "react";
import type { ApiResponse, Project } from "@elruso/types";
import { apiFetch } from "../api";
import { useSelectedProject } from "../projectStore";

export function ProjectsList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
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
    try {
      const res = await apiFetch("/api/ops/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data: ApiResponse<Project> = await res.json();
      if (data.ok && data.data) {
        setNewName("");
        setSelectedProject({ id: data.data.id, name: data.data.name });
        fetchProjects();
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
      <h1 className="text-xl font-bold mb-6">Proyectos</h1>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded px-4 py-2 mb-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Create new project */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Nombre del nuevo proyecto"
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded text-sm transition-colors"
        >
          {creating ? "..." : "Crear"}
        </button>
      </div>

      {/* Project list */}
      <div className="space-y-2">
        {projects.map((p) => {
          const isSelected = selectedProject?.id === p.id;
          return (
            <div
              key={p.id}
              onClick={() => handleSelect(p)}
              className={`flex items-center justify-between p-4 rounded border cursor-pointer transition-colors ${
                isSelected
                  ? "border-blue-500 bg-blue-900/30"
                  : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
              }`}
            >
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {p.profile} &middot; {new Date(p.created_at).toLocaleDateString("es-AR")}
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
          <div className="text-center text-gray-500 py-8">
            No hay proyectos. Crea uno para comenzar.
          </div>
        )}
      </div>
    </div>
  );
}
