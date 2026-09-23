import {
  Check,
  Folder,
  FolderPlus,
  HardDriveDownload,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { text } from '../../i18n';
import {
  createCollection,
  getPaperRelations,
  listCollections,
} from '../../repositories/libraryRepository';
import type { Collection, Language } from '../../types';

interface CollectionRow {
  collection: Collection;
  depth: number;
}

function flattenCollections(collections: Collection[]): CollectionRow[] {
  const rows: CollectionRow[] = [];
  const visited = new Set<string>();
  const append = (parentId: string | undefined, depth: number) => {
    for (const collection of collections.filter((item) => item.parentId === parentId)) {
      if (visited.has(collection.id)) continue;
      visited.add(collection.id);
      rows.push({ collection, depth });
      append(collection.id, depth + 1);
    }
  };
  append(undefined, 0);
  for (const collection of collections) {
    if (!visited.has(collection.id)) rows.push({ collection, depth: 0 });
  }
  return rows;
}

export function SaveToLibraryDialog(props: {
  paperId: string;
  paperTitle: string;
  language: Language;
  saved: boolean;
  offlineAvailable: boolean;
  onClose: () => void;
  onConfirm: (collectionIds: string[], saveOffline: boolean) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saveOffline, setSaveOffline] = useState(props.offlineAvailable);
  const [newName, setNewName] = useState('');
  const [parentId, setParentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');
  const [createdId, setCreatedId] = useState('');
  const rows = useMemo(() => flattenCollections(collections), [collections]);

  useEffect(() => {
    let active = true;
    void Promise.all([listCollections(), getPaperRelations(props.paperId)])
      .then(([nextCollections, relations]) => {
        if (!active) return;
        setCollections(nextCollections);
        setSelectedIds(new Set(relations.collections.map((collection) => collection.id)));
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error
            ? reason.message
            : text(props.language, 'Could not load library folders.', '无法加载资料库文件夹。'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [props.language, props.paperId]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) props.onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, props]);

  const createFolder = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const normalizedName = newName.trim().toLocaleLowerCase();
      const existing = collections.find((collection) =>
        (collection.parentId || '') === parentId
        && collection.name.trim().toLocaleLowerCase() === normalizedName,
      );
      const collection = existing || await createCollection(newName, parentId || undefined);
      setCollections(await listCollections());
      setSelectedIds((current) => new Set(current).add(collection.id));
      setCreatedId(collection.id);
      setNewName('');
      setParentId(collection.id);
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : text(props.language, 'Could not create the folder.', '无法创建文件夹。'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await props.onConfirm([...selectedIds], saveOffline);
      props.onClose();
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : text(props.language, 'Could not save this paper.', '无法保存这篇论文。'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await props.onRemove();
      props.onClose();
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : text(props.language, 'Could not remove this paper.', '无法移出这篇论文。'));
    } finally {
      setBusy(false);
    }
  };

  return <div
    className="reader-dialog-backdrop"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) props.onClose();
    }}
  >
    <section
      className="save-library-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-library-title"
    >
      <header>
        <div>
          <h2 id="save-library-title">
            {text(props.language, 'Save to PaperFlow', '保存到 PaperFlow')}
          </h2>
          <p title={props.paperTitle}>{props.paperTitle}</p>
        </div>
        <button
          type="button"
          title={text(props.language, 'Close', '关闭')}
          disabled={busy}
          onClick={props.onClose}
        ><X /></button>
      </header>

      <div className="save-library-content">
        <section>
          <div className="save-library-heading">
            <strong>{text(props.language, 'Folders', '文件夹')}</strong>
            <span>{text(
              props.language,
              'Choose one or more folders. Leave empty to keep it in All papers.',
              '可选择一个或多个文件夹；不选择时保存在“全部论文”。',
            )}</span>
          </div>
          <div className="save-library-tree" aria-busy={loading}>
            <button
              type="button"
              className="save-library-root"
              data-active={selectedIds.size === 0}
              onClick={() => setSelectedIds(new Set())}
            >
              <Folder />
              <span>{text(props.language, 'All papers', '全部论文')}</span>
              {selectedIds.size === 0 && <Check />}
            </button>
            {loading
              ? <p>{text(props.language, 'Loading folders…', '正在加载文件夹…')}</p>
              : rows.map(({ collection, depth }) => {
                  const selected = selectedIds.has(collection.id);
                  return <label
                    key={collection.id}
                    className="save-library-folder"
                    data-active={selected}
                    data-created={createdId === collection.id}
                    style={{ paddingLeft: 10 + depth * 18 }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => setSelectedIds((current) => {
                        const next = new Set(current);
                        if (next.has(collection.id)) next.delete(collection.id);
                        else next.add(collection.id);
                        return next;
                      })}
                    />
                    <Folder />
                    <span>{collection.name}</span>
                  </label>;
                })}
          </div>
        </section>

        <section className="save-library-create">
          <div className="save-library-heading">
            <strong><FolderPlus />{text(props.language, 'New folder', '新建文件夹')}</strong>
            <span>{text(
              props.language,
              'Choose a parent to create nested folders.',
              '选择上级文件夹即可创建嵌套目录。',
            )}</span>
          </div>
          <div>
            <select
              aria-label={text(props.language, 'Parent folder', '上级文件夹')}
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">{text(props.language, 'Top level', '顶层')}</option>
              {rows.map(({ collection, depth }) => <option
                key={collection.id}
                value={collection.id}
              >{`${'  '.repeat(depth)}${collection.name}`}</option>)}
            </select>
            <input
              value={newName}
              placeholder={text(props.language, 'Folder name', '文件夹名称')}
              aria-label={text(props.language, 'Folder name', '文件夹名称')}
              onChange={(event) => {
                setNewName(event.target.value);
                setCreatedId('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createFolder();
              }}
            />
            <button
              type="button"
              disabled={busy || !newName.trim()}
              onClick={() => void createFolder()}
            >{text(props.language, 'Create', '创建')}</button>
          </div>
          {createdId && <p className="save-library-created"><Check />{text(
            props.language,
            'Folder created and selected. New folders will be nested inside it.',
            '文件夹已创建并选中；继续新建时会创建在该文件夹下。',
          )}</p>}
        </section>

        <label className="save-library-offline">
          <input
            type="checkbox"
            checked={saveOffline}
            disabled={props.offlineAvailable}
            onChange={(event) => setSaveOffline(event.target.checked)}
          />
          <HardDriveDownload />
          <span>
            <strong>{text(props.language, 'Keep a local offline PDF', '在本机保存离线 PDF')}</strong>
            <small>{props.offlineAvailable
              ? text(props.language, 'Already available without a network connection.', '已可在断网时打开。')
              : text(props.language, 'Stores the PDF on this device for offline reading.', '将 PDF 缓存在此设备，用于断网阅读。')}</small>
          </span>
        </label>

        {error && <p className="save-library-error" role="alert">{error}</p>}
        {confirmRemove && <div className="save-library-remove-confirm">
          <span>{text(
            props.language,
            'Move this paper to Trash? Notes and annotations will be retained.',
            '将这篇论文移到废纸篓？笔记和批注会保留。',
          )}</span>
          <button type="button" onClick={() => setConfirmRemove(false)}>
            {text(props.language, 'Keep', '保留')}
          </button>
          <button type="button" className="danger" disabled={busy} onClick={() => void remove()}>
            {text(props.language, 'Move to Trash', '移到废纸篓')}
          </button>
        </div>}
      </div>

      <footer>
        {props.saved && !confirmRemove
          ? <button
              type="button"
              className="save-library-remove"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            ><Trash2 />{text(props.language, 'Remove from library', '移出资料库')}</button>
          : <span />}
        <div>
          <button type="button" disabled={busy} onClick={props.onClose}>
            {text(props.language, 'Cancel', '取消')}
          </button>
          <button type="button" className="primary" disabled={busy || loading} onClick={() => void save()}>
            {text(props.language, props.saved ? 'Update' : 'Save', props.saved ? '更新' : '保存')}
          </button>
        </div>
      </footer>
    </section>
  </div>;
}
