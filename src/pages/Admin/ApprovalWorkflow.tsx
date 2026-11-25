import { useState, useMemo } from "react";
import { BRAND } from "@/config/navigation";
import { useResource } from "@/hooks/useResource";
import { saveResource } from "@/services/dataSource";
import {
  Card,
  PageTitle,
  PrimaryButton,
  GhostButton,
  Badge,
  Modal,
  Toggle,
  Tabs,
} from "@/components/ui";

export type ApprovalStage = {
  id: string;
  stage_key: string;
  label: string;
  role_name: string;
  stage_order: number;
  document_type: "AR" | "DTR" | "ALL";
  color?: string;
  description?: string;
  is_final: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

const PRESET_COLORS = [
  { name: "Forest Green", value: "#3a7d4e" },
  { name: "Ocean Blue", value: "#3f8ecc" },
  { name: "Royal Purple", value: "#8a63c4" },
  { name: "Warm Amber", value: "#d99a2b" },
  { name: "Crimson", value: "#c0392b" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Slate", value: "#475569" },
];

const SUGGESTED_ROLES = [
  "Checker",
  "Secretary",
  "HR",
  "Accounting",
  "Dean",
  "Department Chair",
  "Registrar",
  "Vice President for Academic Affairs",
];

export default function ApprovalWorkflow() {
  const { data: rawStages, setData: setStages, loading, reload } = useResource<ApprovalStage[]>(
    "/approvals/stages",
    [],
  );
  const stages = Array.isArray(rawStages) ? rawStages : [];

  const [activeTab, setActiveTab] = useState<string>("Accomplishment Reports");
  const [editingStage, setEditingStage] = useState<ApprovalStage | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<ApprovalStage | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    label: string;
    role_name: string;
    document_type: "AR" | "DTR" | "ALL";
    stage_order: number;
    color: string;
    description: string;
    is_final: boolean;
    is_active: boolean;
  }>({
    label: "",
    role_name: "Checker",
    document_type: "AR",
    stage_order: 1,
    color: "#3a7d4e",
    description: "",
    is_final: false,
    is_active: true,
  });

  const docTypeFilter = activeTab === "Accomplishment Reports" ? "AR" : "DTR";

  // Filtered and sorted stages for active tab
  const currentStages = useMemo(() => {
    return stages
      .filter((s) => s.document_type === docTypeFilter || s.document_type === "ALL")
      .sort((a, b) => a.stage_order - b.stage_order);
  }, [stages, docTypeFilter]);

  const openCreateModal = () => {
    const nextOrder = currentStages.length > 0
      ? Math.max(...currentStages.map((s) => s.stage_order)) + 1
      : 1;

    setFormData({
      label: "",
      role_name: "Checker",
      document_type: docTypeFilter,
      stage_order: nextOrder,
      color: PRESET_COLORS[currentStages.length % PRESET_COLORS.length].value,
      description: "",
      is_final: currentStages.length === 0,
      is_active: true,
    });
    setIsCreating(true);
    setEditingStage(null);
  };

  const openEditModal = (stage: ApprovalStage) => {
    setEditingStage(stage);
    setFormData({
      label: stage.label,
      role_name: stage.role_name || stage.label,
      document_type: stage.document_type || docTypeFilter,
      stage_order: stage.stage_order,
      color: stage.color || "#3a7d4e",
      description: stage.description || "",
      is_final: stage.is_final,
      is_active: stage.is_active,
    });
    setIsCreating(false);
  };

  const closeFormModal = () => {
    setIsCreating(false);
    setEditingStage(null);
  };

  const handleSaveStage = async () => {
    if (!formData.label.trim()) {
      setFlash({ message: "Stage label is required.", type: "error" });
      return;
    }

    setSaving(true);
    setFlash(null);

    try {
      if (isCreating) {
        await saveResource<ApprovalStage>("/approvals/stages", formData, "POST");
        setFlash({ message: `Approval stage "${formData.label}" created successfully.`, type: "success" });
      } else if (editingStage) {
        await saveResource<ApprovalStage>(`/approvals/stages/${editingStage.id}`, formData, "PUT");
        setFlash({ message: `Approval stage "${formData.label}" updated successfully.`, type: "success" });
      }
      await reload();
      closeFormModal();
    } catch (err) {
      console.error("Failed to save approval stage:", err);
      setFlash({
        message: err instanceof Error ? err.message : "Unable to save stage changes.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStage = async () => {
    if (!stageToDelete) return;
    setSaving(true);
    try {
      await saveResource(`/approvals/stages/${stageToDelete.id}`, null, "DELETE");
      setFlash({
        message: `Approval stage "${stageToDelete.label}" deactivated safely. Historical submissions remain intact.`,
        type: "success",
      });
      await reload();
      setStageToDelete(null);
    } catch (err) {
      console.error("Failed to deactivate stage:", err);
      setFlash({
        message: err instanceof Error ? err.message : "Unable to deactivate stage.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (stage: ApprovalStage, nextActive: boolean) => {
    try {
      await saveResource(`/approvals/stages/${stage.id}`, { is_active: nextActive }, "PUT");
      setStages((prev) =>
        prev.map((s) => (s.id === stage.id ? { ...s, is_active: nextActive } : s)),
      );
      setFlash({
        message: `Stage "${stage.label}" marked ${nextActive ? "Active" : "Inactive"}.`,
        type: "success",
      });
    } catch (err) {
      console.error("Failed to toggle stage status:", err);
      setFlash({
        message: err instanceof Error ? err.message : "Unable to toggle stage status.",
        type: "error",
      });
    }
  };

  const handleMoveStage = async (stageIndex: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? stageIndex - 1 : stageIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentStages.length) return;

    const list = [...currentStages];
    const itemA = list[stageIndex];
    const itemB = list[targetIndex];

    const tempOrder = itemA.stage_order;
    itemA.stage_order = itemB.stage_order;
    itemB.stage_order = tempOrder;

    // Optimistic update
    setStages((prev) =>
      prev.map((s) => {
        if (s.id === itemA.id) return { ...s, stage_order: itemA.stage_order };
        if (s.id === itemB.id) return { ...s, stage_order: itemB.stage_order };
        return s;
      }),
    );

    try {
      await saveResource("/approvals/stages/reorder", {
        stages: [
          { id: itemA.id, stage_order: itemA.stage_order },
          { id: itemB.id, stage_order: itemB.stage_order },
        ],
      }, "PUT");
      await reload();
    } catch (err) {
      console.error("Failed to reorder stages:", err);
      await reload();
    }
  };

  const handleResetToDefault = async () => {
    setSaving(true);
    try {
      await saveResource("/approvals/stages/reset", {}, "POST");
      setFlash({
        message: "Approval workflow successfully reset to the canonical 4-step pipeline.",
        type: "success",
      });
      await reload();
      setShowResetConfirm(false);
    } catch (err) {
      console.error("Failed to reset approval pipeline:", err);
      setFlash({
        message: err instanceof Error ? err.message : "Unable to reset pipeline.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-8">
      {/* Page Title */}
      <PageTitle
        title="Approval Flow"
        subtitle="Configure dynamic multi-stage approval pipelines for faculty submissions."
        action={
          <div className="flex items-center gap-2">
            <GhostButton onClick={() => setShowResetConfirm(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Reset to Default
            </GhostButton>
            <PrimaryButton onClick={openCreateModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Stage
            </PrimaryButton>
          </div>
        }
      />

      {/* Backward-Compatibility / Past Paper Flow Notice Banner */}
      <div
        className="mb-4 flex items-start gap-3 p-3.5 rounded-2xl border text-[12.5px]"
        style={{ background: "#f0f7f3", borderColor: "#cce4d6", color: "#1c4a2c" }}
      >
        <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[#3a7d4e] text-white flex-shrink-0 mt-0.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-3 h-3">
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
        <div className="space-y-0.5">
          <p className="font-semibold text-[#11331e]">
            Dynamic Workflow with Historical Paper Flow Versioning
          </p>
          <p className="text-[12px] leading-relaxed text-[#2f5c3e]">
            Any modifications, new stages, or reordering configured here will strictly apply to <strong>future submissions</strong>.
            All past and currently submitted paper flow applications automatically preserve their original historical approval routing without disruption.
          </p>
        </div>
      </div>

      {flash && (
        <div
          className={`mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl text-[12.5px] font-medium ${
            flash.type === "success"
              ? "bg-[#eaf4ee] text-[#2f7043]"
              : "bg-[#fbecec] text-[#c0392b]"
          }`}
        >
          <span>{flash.message}</span>
          <button
            type="button"
            onClick={() => setFlash(null)}
            className="transition-opacity hover:opacity-60 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs for Document Types */}
      <div className="mb-4">
        <Tabs
          tabs={["Accomplishment Reports", "Daily Time Records"]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Visual Pipeline Rail */}
      <Card className="p-4 mb-4 overflow-x-auto">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-[12px] font-bold text-[#111c14] uppercase tracking-wider">
            {activeTab} Approval Pipeline (Active Sequence)
          </p>
          <span className="text-[11px] text-[#8fa394]">
            {currentStages.filter((s) => s.is_active).length} Active Steps
          </span>
        </div>

        <div className="flex items-center gap-2 min-w-max py-2">
          {currentStages
            .filter((s) => s.is_active)
            .map((stage, idx, activeArr) => (
              <div key={stage.id || stage.stage_key} className="flex items-center gap-2">
                <div
                  className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border bg-white shadow-xs"
                  style={{ borderColor: stage.color || "#3a7d4e" }}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10.5px] font-bold"
                    style={{ background: stage.color || "#3a7d4e" }}
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-[12.5px] font-bold text-[#111c14] leading-tight">
                      {stage.label}
                    </p>
                    <p className="text-[10px] text-[#8fa394]">
                      Role: {stage.role_name || stage.label}
                    </p>
                  </div>
                  {stage.is_final && (
                    <span
                      className="ml-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-md text-[#8a5b14] bg-[#fbf1de]"
                      title="Approving at this stage completes verification and authorizes payroll"
                    >
                      Payroll Trigger
                    </span>
                  )}
                </div>

                {idx < activeArr.length - 1 && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#b6c3ba"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4 flex-shrink-0"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}

          {currentStages.filter((s) => s.is_active).length === 0 && (
            <p className="text-[12px] text-[#8fa394] italic py-2">
              No active stages in this pipeline. Click &ldquo;Add Stage&rdquo; to define a step.
            </p>
          )}
        </div>
      </Card>

      {/* Stages List */}
      <Card className="p-0 overflow-hidden">
        <div
          className="grid grid-cols-[3.5rem_2fr_1.5fr_1fr_1.5fr_6rem_8rem] items-center px-4 py-2.5 text-[11px] font-semibold text-[#8fa394] uppercase tracking-wider border-b"
          style={{ background: "#fafbfa", borderColor: "#eef1ef" }}
        >
          <span>Order</span>
          <span>Stage Label</span>
          <span>Required Staff Role</span>
          <span>Doc Type</span>
          <span>Description</span>
          <span className="text-center">Active</span>
          <span className="text-right">Actions</span>
        </div>

        {loading && stages.length === 0 ? (
          <div className="py-12 text-center text-[12.5px] text-[#8fa394]">
            <div
              className="inline-block w-5 h-5 border-2 border-t-transparent rounded-full animate-spin mb-2"
              style={{ borderColor: BRAND, borderTopColor: "transparent" }}
            />
            <p>Loading workflow stages...</p>
          </div>
        ) : currentStages.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-[#8fa394]">
            No stages configured for {activeTab}. Click &ldquo;Add Stage&rdquo; above to get started.
          </div>
        ) : (
          currentStages.map((stage, idx) => (
            <div
              key={stage.id}
              className={`grid grid-cols-[3.5rem_2fr_1.5fr_1fr_1.5fr_6rem_8rem] items-center px-4 py-3 border-t text-[12.5px] transition-colors ${
                stage.is_active ? "hover:bg-[#f8faf9]" : "bg-[#fcfdfc] opacity-65"
              }`}
              style={{ borderColor: "#f0f3f1" }}
            >
              {/* Order + Move Controls */}
              <div className="flex items-center gap-1">
                <span className="w-5 text-[12px] font-bold text-[#5a6b5e] tabular-nums">
                  #{stage.stage_order}
                </span>
                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMoveStage(idx, "up")}
                    className="p-0.5 text-[#8fa394] hover:text-[#111c14] disabled:opacity-20 cursor-pointer disabled:cursor-default"
                    title="Move earlier in approval sequence"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={idx === currentStages.length - 1}
                    onClick={() => handleMoveStage(idx, "down")}
                    className="p-0.5 text-[#8fa394] hover:text-[#111c14] disabled:opacity-20 cursor-pointer disabled:cursor-default"
                    title="Move later in approval sequence"
                  >
                    ▼
                  </button>
                </div>
              </div>

              {/* Stage Label */}
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                  style={{ background: stage.color || "#3a7d4e" }}
                />
                <div className="min-w-0">
                  <p className="font-semibold text-[#111c14] truncate">
                    {stage.label}
                  </p>
                  <p className="text-[10px] text-[#8fa394] font-mono">
                    {stage.stage_key}
                  </p>
                </div>
                {stage.is_final && (
                  <Badge tone="amber" dot>
                    Final Stage
                  </Badge>
                )}
              </div>

              {/* Required Staff Role */}
              <div className="pr-2">
                <span className="px-2 py-0.5 rounded-lg text-[11.5px] font-medium bg-[#f0f4f1] text-[#2b5937]">
                  {stage.role_name || stage.label}
                </span>
              </div>

              {/* Document Type */}
              <div>
                <Badge tone={stage.document_type === "AR" ? "blue" : "green"}>
                  {stage.document_type}
                </Badge>
              </div>

              {/* Description */}
              <div className="pr-2 truncate text-[#5a6b5e] text-[11.5px]">
                {stage.description || "—"}
              </div>

              {/* Active Toggle */}
              <div className="flex justify-center">
                <Toggle
                  on={stage.is_active}
                  onChange={(val) => handleToggleActive(stage, val)}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => openEditModal(stage)}
                  className="px-2.5 py-1 rounded-lg text-[11.5px] font-semibold border hover:bg-white text-[#2d3830] transition-colors cursor-pointer"
                  style={{ borderColor: "#dce3de" }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setStageToDelete(stage)}
                  className="px-2 py-1 rounded-lg text-[11.5px] font-semibold text-[#c0392b] hover:bg-[#fdf3f2] transition-colors cursor-pointer"
                  title="Deactivate stage"
                >
                  Deactivate
                </button>
              </div>
            </div>
          ))
        )}
      </Card>

      {/* Add / Edit Stage Modal */}
      <Modal
        isOpen={isCreating || !!editingStage}
        onClose={closeFormModal}
        title={isCreating ? "Add Approval Stage" : `Edit Stage · ${editingStage?.label}`}
        size="lg"
        align="left"
        actions={
          <>
            <GhostButton onClick={closeFormModal}>Cancel</GhostButton>
            <PrimaryButton onClick={handleSaveStage} disabled={saving}>
              {saving ? "Saving..." : isCreating ? "Create Stage" : "Save Changes"}
            </PrimaryButton>
          </>
        }
      >
        <div className="space-y-3.5 py-1 text-[12.5px]">
          {/* Document Type */}
          <div>
            <label className="block text-[11.5px] font-semibold text-[#111c14] mb-1">
              Applicable Document Flow
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, document_type: "AR" }))}
                className="py-2 px-3 rounded-xl border text-[12px] font-semibold transition-all cursor-pointer text-center"
                style={{
                  borderColor: formData.document_type === "AR" ? BRAND : "#e2e8e4",
                  background: formData.document_type === "AR" ? "#f2f7f4" : "#fff",
                  color: formData.document_type === "AR" ? BRAND : "#5a6b5e",
                }}
              >
                Accomplishment Report (AR)
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, document_type: "DTR" }))}
                className="py-2 px-3 rounded-xl border text-[12px] font-semibold transition-all cursor-pointer text-center"
                style={{
                  borderColor: formData.document_type === "DTR" ? BRAND : "#e2e8e4",
                  background: formData.document_type === "DTR" ? "#f2f7f4" : "#fff",
                  color: formData.document_type === "DTR" ? BRAND : "#5a6b5e",
                }}
              >
                Daily Time Record (DTR)
              </button>
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="block text-[11.5px] font-semibold text-[#111c14] mb-1">
              Stage Name / Label *
            </label>
            <input
              type="text"
              value={formData.label}
              onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="e.g. Dean Review, Department Chair, Checker"
              className="w-full h-9 px-3 rounded-xl border text-[13px] outline-none focus:border-[#3a7d4e]"
              style={{ borderColor: "#e2e8e4" }}
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-[11.5px] font-semibold text-[#111c14] mb-1">
              Required Staff Position / Role *
            </label>
            <input
              type="text"
              value={formData.role_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, role_name: e.target.value }))}
              placeholder="e.g. Checker, Secretary, HR, Accounting, Dean"
              className="w-full h-9 px-3 rounded-xl border text-[13px] outline-none focus:border-[#3a7d4e]"
              style={{ borderColor: "#e2e8e4" }}
            />
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              <span className="text-[10.5px] text-[#8fa394]">Quick picks:</span>
              {SUGGESTED_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, role_name: r, label: prev.label || r }))}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#f2f4f3] text-[#405347] hover:bg-[#e2e8e4] transition-colors cursor-pointer"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11.5px] font-semibold text-[#111c14] mb-1">
              Description / Instructions for Approver
            </label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Outline what the staff reviewer validates at this stage…"
              className="w-full px-3 py-2 rounded-xl border text-[12.5px] outline-none focus:border-[#3a7d4e] resize-none"
              style={{ borderColor: "#e2e8e4" }}
            />
          </div>

          {/* Color Swatch */}
          <div>
            <label className="block text-[11.5px] font-semibold text-[#111c14] mb-1.5">
              Accent Badge Color
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, color: c.value }))}
                  className="w-7 h-7 rounded-full border-2 transition-transform cursor-pointer flex items-center justify-center text-white text-[11px]"
                  style={{
                    background: c.value,
                    borderColor: formData.color === c.value ? "#111c14" : "transparent",
                    transform: formData.color === c.value ? "scale(1.15)" : "scale(1)",
                  }}
                  title={c.name}
                >
                  {formData.color === c.value && "✓"}
                </button>
              ))}
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
                className="w-7 h-7 rounded-lg border cursor-pointer p-0 ml-1"
                title="Custom Color"
              />
            </div>
          </div>

          {/* Toggle: Final Payroll Clearance Stage */}
          <div className="pt-2 border-t flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-[#111c14]">
                Final Payroll Clearance Stage
              </p>
              <p className="text-[11px] text-[#8fa394]">
                When approved at this step, the report is considered fully approved and automatically computes faculty payroll.
              </p>
            </div>
            <Toggle
              on={formData.is_final}
              onChange={(val) => setFormData((prev) => ({ ...prev, is_final: val }))}
            />
          </div>

          {/* Toggle: Active */}
          <div className="pt-2 border-t flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-[#111c14]">
                Active in Pipeline
              </p>
              <p className="text-[11px] text-[#8fa394]">
                Include this stage in newly submitted applications.
              </p>
            </div>
            <Toggle
              on={formData.is_active}
              onChange={(val) => setFormData((prev) => ({ ...prev, is_active: val }))}
            />
          </div>
        </div>
      </Modal>

      {/* Deactivate Confirmation Modal */}
      <Modal
        isOpen={!!stageToDelete}
        onClose={() => setStageToDelete(null)}
        title="Deactivate Approval Stage"
        icon={
          <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[#fdf3f2] text-[#c0392b]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        }
        actions={
          <>
            <GhostButton onClick={() => setStageToDelete(null)}>Cancel</GhostButton>
            <PrimaryButton onClick={handleDeleteStage} disabled={saving}>
              {saving ? "Deactivating..." : "Yes, Deactivate"}
            </PrimaryButton>
          </>
        }
      >
        <p className="text-[13px] text-[#3d4a41] leading-relaxed">
          Are you sure you want to deactivate the stage <strong>&ldquo;{stageToDelete?.label}&rdquo;</strong>?
        </p>
        <p className="mt-2 text-[11.5px] text-[#8fa394] leading-relaxed">
          Historical paper flow applications that used this stage will remain 100% safe and intact.
          Future submissions will simply bypass this step.
        </p>
      </Modal>

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="Reset Workflow to Canonical Default"
        icon={
          <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[#fbf1de] text-[#996515]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        }
        actions={
          <>
            <GhostButton onClick={() => setShowResetConfirm(false)}>Cancel</GhostButton>
            <PrimaryButton onClick={handleResetToDefault} disabled={saving}>
              {saving ? "Resetting..." : "Yes, Reset Pipeline"}
            </PrimaryButton>
          </>
        }
      >
        <p className="text-[13px] text-[#3d4a41] leading-relaxed">
          Resetting will restore the default 4-stage pipeline for both Accomplishment Reports and Daily Time Records:
        </p>
        <div className="my-2.5 px-3 py-2 rounded-xl bg-[#f7f9f8] text-[12px] font-semibold text-[#111c14] border border-[#e2e8e4]">
          Checker → Secretary → HR → Accounting (Payroll Clearance)
        </div>
        <p className="text-[11.5px] text-[#8fa394]">
          Existing submissions will continue unaffected under their original snapshot.
        </p>
      </Modal>
    </div>
  );
}
