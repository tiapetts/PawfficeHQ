import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "../lib/supabase";
import "./ProfilePhoto.css";

type Props = {
  businessId: string;
  entity: "clients" | "pets";
  table: "CLIENT" | "PET";
  recordId: string | number;
  photoPath: string | null;
  initials: string;
  label: string;
  editable?: boolean;
  compact?: boolean;
  onChanged?: () => void;
};

const bucket = "profile-photos";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function ProfilePhoto({
  businessId,
  entity,
  table,
  recordId,
  photoPath,
  initials,
  label,
  editable = false,
  compact = false,
  onChanged,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadPhoto() {
      if (!photoPath) {
        setImageUrl(null);
        return;
      }
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(photoPath, 60 * 60);
      if (active) {
        setImageUrl(error ? null : data.signedUrl);
        if (error && editable) setMessage(error.message);
      }
    }
    void loadPhoto();
    return () => {
      active = false;
    };
  }, [editable, photoPath]);

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    if (!allowedTypes.has(file.type)) {
      setMessage("Choose a JPG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Photo must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }

    setWorking(true);
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${businessId}/${entity}/${recordId}/profile-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      setWorking(false);
      setMessage(uploadError.message);
      return;
    }

    const { error: updateError } = await supabase
      .from(table)
      .update({ profile_photo_path: path })
      .eq("id", recordId)
      .eq("business_id", businessId);
    if (updateError) {
      await supabase.storage.from(bucket).remove([path]);
      setWorking(false);
      setMessage(updateError.message);
      return;
    }
    if (photoPath) await supabase.storage.from(bucket).remove([photoPath]);
    setWorking(false);
    event.target.value = "";
    onChanged?.();
  }

  async function removePhoto() {
    if (!photoPath) return;
    setWorking(true);
    setMessage("");
    const { error: updateError } = await supabase
      .from(table)
      .update({ profile_photo_path: null })
      .eq("id", recordId)
      .eq("business_id", businessId);
    if (updateError) {
      setWorking(false);
      setMessage(updateError.message);
      return;
    }
    const { error: removeError } = await supabase.storage.from(bucket).remove([photoPath]);
    setWorking(false);
    if (removeError) setMessage(`Profile updated, but the old file could not be removed: ${removeError.message}`);
    onChanged?.();
  }

  return (
    <div className={`profile-photo-control ${compact ? "compact" : ""}`}>
      <div className="profile-photo-frame">
        {imageUrl ? <img src={imageUrl} alt={`${label} profile`} /> : <span>{initials || "?"}</span>}
      </div>
      {editable && (
        <div className="profile-photo-actions">
          <div>
            <strong>{label} photo</strong>
            <small>JPG, PNG, or WebP · maximum 5 MB</small>
          </div>
          <div>
            <button type="button" className="secondary-button" disabled={working} onClick={() => inputRef.current?.click()}>
              {working ? "Working…" : photoPath ? "Replace photo" : "Upload photo"}
            </button>
            {photoPath && <button type="button" className="profile-photo-remove" disabled={working} onClick={() => void removePhoto()}>Remove</button>}
          </div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadPhoto(event)} />
          {message && <p className="profile-photo-error" role="alert">{message}</p>}
        </div>
      )}
    </div>
  );
}
