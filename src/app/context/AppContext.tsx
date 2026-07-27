import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { Project, User } from "../data/types";

type AppContextType = {
  user: User | null;
  projects: Project[];
  login: (email: string, password: string) => boolean;
  logout: () => void;
  register: (user: User, password: string) => void;
  addProject: (p: Project) => void;
  updateProject: (p: Project) => void;
  deleteProject: (id: string) => void;
};

const AppContext = createContext<AppContextType | null>(null);

const DEMO_USER: User = {
  name: "Alex Rivera",
  email: "alex@greenedgelawn.com",
  company: "Green Edge Lawn & Landscape",
  phone: "(512) 555-0198",
};

const SEED_PROJECTS: Project[] = [
  {
    id: "p1",
    name: "Hartwell Backyard Redesign",
    client: "Mark Hartwell",
    address: "822 Elmwood Dr, Austin TX",
    status: "active",
    projectType: "Landscape Design",
    squareFootage: 2400,
    laborRate: 65,
    laborHours: 28,
    lineItems: [
      { id: "l1", description: "Sod (Zoysia)", qty: 2400, unit: "sq ft", unitCost: 0.55 },
      { id: "l2", description: "Mulch delivery", qty: 8, unit: "yards", unitCost: 45 },
      { id: "l3", description: "Native shrubs", qty: 12, unit: "each", unitCost: 38 },
    ],
    aiEstimate: "Based on project scope, estimated total is $4,280–$4,680. Labor accounts for approximately 42% of the cost. Sod installation is the largest material line item. Consider scheduling irrigation assessment before sod delivery.",
    totalEstimate: 4480,
    notes: "Client prefers drought-tolerant plants. Check HOA restrictions.",
    createdAt: "2025-07-01T09:00:00Z",
    updatedAt: "2025-07-15T14:30:00Z",
  },
  {
    id: "p2",
    name: "Patel Driveway & Front Beds",
    client: "Priya Patel",
    address: "301 Magnolia Ln, Round Rock TX",
    status: "active",
    projectType: "Hardscaping",
    squareFootage: 900,
    laborRate: 70,
    laborHours: 16,
    lineItems: [
      { id: "l4", description: "Concrete pavers", qty: 900, unit: "sq ft", unitCost: 4.2 },
      { id: "l5", description: "Edging / border", qty: 120, unit: "lin ft", unitCost: 3.5 },
    ],
    aiEstimate: "Hardscaping job with moderate complexity. Estimate range $5,000–$5,500. Recommend 10% contingency for sub-base grading surprises.",
    totalEstimate: 5240,
    notes: "Pavers must match existing driveway color (sandstone).",
    createdAt: "2025-07-10T08:00:00Z",
    updatedAt: "2025-07-20T11:00:00Z",
  },
  {
    id: "p3",
    name: "Riverside HOA Common Area",
    client: "Riverside HOA",
    address: "100 Riverside Blvd, Cedar Park TX",
    status: "completed",
    projectType: "Lawn Maintenance",
    squareFootage: 12000,
    laborRate: 55,
    laborHours: 48,
    lineItems: [
      { id: "l6", description: "Fertilizer application", qty: 12000, unit: "sq ft", unitCost: 0.08 },
      { id: "l7", description: "Weed control", qty: 12000, unit: "sq ft", unitCost: 0.05 },
    ],
    aiEstimate: "Routine maintenance scope. Total estimated at $3,900. High labor portion reflects large area mow and trim cycles.",
    totalEstimate: 3900,
    notes: "Recurring monthly contract, April–October.",
    createdAt: "2025-04-01T07:00:00Z",
    updatedAt: "2025-06-30T16:00:00Z",
  },
];

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => load("ls_user", null));
  const [projects, setProjects] = useState<Project[]>(() => load("ls_projects", SEED_PROJECTS));

  useEffect(() => { localStorage.setItem("ls_projects", JSON.stringify(projects)); }, [projects]);
  useEffect(() => { localStorage.setItem("ls_user", JSON.stringify(user)); }, [user]);

  function login(email: string, _password: string) {
    if (email === "demo@greenedge.app" || email === DEMO_USER.email) {
      setUser(DEMO_USER);
      return true;
    }
    const saved = load<{ user: User } | null>("ls_registered", null);
    if (saved && saved.user.email === email) {
      setUser(saved.user);
      return true;
    }
    return false;
  }

  function logout() { setUser(null); }

  function register(u: User, _password: string) {
    localStorage.setItem("ls_registered", JSON.stringify({ user: u }));
    setUser(u);
  }

  function addProject(p: Project) { setProjects((prev) => [p, ...prev]); }
  function updateProject(p: Project) { setProjects((prev) => prev.map((x) => x.id === p.id ? p : x)); }
  function deleteProject(id: string) { setProjects((prev) => prev.filter((x) => x.id !== id)); }

  return (
    <AppContext.Provider value={{ user, projects, login, logout, register, addProject, updateProject, deleteProject }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
