/**
 * Dropsea's words, in English and Spanish. Oxy resolves which language the
 * person uses (`OxyProvider language`); `stringsFor` gives the words for it.
 */
import type { PlatformFileError, PlatformPlace } from '@oxy.so/bloom/platform-surface';
import type { Kind } from '@/lib/kinds';
import type { NameProblem } from '@/lib/names';
import type { SearchDate, SearchKind, SearchKindWords } from '@/lib/search';
import type { TagColor, TagNameProblem } from '@/lib/tags';
import type { UndoAction } from '@/lib/undo';

type PlaceKind = PlatformPlace['kind'] | 'device';

/** Why a change to a local item did not happen: the platform's reasons and the app's own. */
export type FileProblem = PlatformFileError | 'unavailable';

/** Finder's kinds as a search offers them, in English. */
const SEARCH_KINDS_EN: Record<SearchKind, SearchKindWords> = {
  pdf: { name: 'PDF', aliases: [] },
  image: { name: 'Image', aliases: ['Picture', 'Photo'] },
  folder: { name: 'Folder', aliases: ['Directory'] },
  document: { name: 'Document', aliases: [] },
  presentation: { name: 'Presentation', aliases: ['Slides'] },
  spreadsheet: { name: 'Spreadsheet', aliases: [] },
  text: { name: 'Text', aliases: [] },
  source: { name: 'Developer', aliases: ['Source', 'Code'] },
  movie: { name: 'Movie', aliases: ['Video'] },
  music: { name: 'Music', aliases: ['Audio', 'Song'] },
  archive: { name: 'Archive', aliases: ['Zip', 'Compressed'] },
};

const en = {
  appName: 'Dropsea',
  sections: {
    favourites: 'Favourites',
    locations: 'Locations',
    oxy: 'Oxy',
    albums: 'Albums',
  },
  places: {
    home: 'Home',
    desktop: 'Desktop',
    documents: 'Documents',
    downloads: 'Downloads',
    pictures: 'Pictures',
    music: 'Music',
    videos: 'Videos',
    volume: 'Volume',
    device: 'On This Device',
  } satisfies Record<PlaceKind, string>,
  cloud: 'Oxy Files',
  photos: 'Photos',
  albums: 'Albums',
  trash: 'Trash',
  back: 'Back',
  forward: 'Forward',
  path: 'Path',
  computer: 'Computer',
  resizePreview: 'Resize the preview',
  noSelection: 'No selection',
  view: 'View',
  asIcons: 'as Icons',
  asList: 'as List',
  search: 'Search',
  searchIn: (place: string) => `Search in “${place}”`,
  /** Searching through the platform's index, Finder's: its scope, its suggestions and its tokens. */
  searching: {
    scope: 'Search:',
    scopeLabel: 'Search Scope',
    thisComputer: 'This Computer',
    folder: (name: string) => `“${name}”`,
    indexing: 'Indexing…',
    noResults: (query: string) => `No results for “${query}”`,
    suggestions: 'Search Suggestions',
    sections: { kinds: 'Kinds', tags: 'Tags', dates: 'Dates' },
    nameMatches: (text: string) => `Name matches: “${text}”`,
    /** What each token says before its value: "Kind: PDF". */
    filters: { category: 'Kind', tag: 'Tag', date: 'Date', name: 'Name' },
    /** Each kind's name, and other words it is found by as they are typed. */
    kinds: SEARCH_KINDS_EN,
    dates: {
      today: 'Today',
      yesterday: 'Yesterday',
      week: 'This Week',
      month: 'This Month',
      year: 'This Year',
    } satisfies Record<SearchDate, string>,
  },
  columns: {
    name: 'Name',
    date: 'Date Modified',
    deleted: 'Date Deleted',
    taken: 'Date',
    size: 'Size',
    kind: 'Kind',
    origin: 'Where From',
    location: 'Location',
    tags: 'Tags',
  },
  kinds: {
    folder: 'Folder',
    album: 'Album',
    image: 'Image',
    audio: 'Audio',
    video: 'Video',
    pdf: 'PDF document',
    text: 'Plain text',
    code: 'Source code',
    document: 'Document',
    spreadsheet: 'Spreadsheet',
    presentation: 'Presentation',
    archive: 'Archive',
    'disk-image': 'Disk image',
    font: 'Font',
    file: 'Document',
  } satisfies Record<Kind, string>,
  photoCount: (count: number) => (count === 1 ? '1 photo' : `${count} photos`),
  items: (count: number) => (count === 1 ? '1 item' : `${count} items`),
  selected: (count: number, of: number) => `${count} of ${of} selected`,
  empty: {
    folder: 'This folder is empty',
    trash: 'The Trash is empty',
    cloud: 'Nothing in Oxy Files yet',
    cloudHint: 'Files you upload to Oxy Files appear here, on every device you sign in on.',
    photos: 'No photos yet',
    photosHint: 'Photos and videos you keep in Oxy Files appear here.',
    albums: 'No albums yet',
    albumsHint: 'Make an album to keep photos together.',
    album: 'This album is empty',
    albumHint: 'Add photos from Photos or Oxy Files.',
    noResults: (query: string) => `Nothing named “${query}” here`,
  },
  signIn: {
    cloudTitle: 'Your files, on every device',
    cloudBody: 'Sign in with Oxy to see Oxy Files, your photos and your albums here.',
  },
  units: {
    bytes: (count: number) => (count === 1 ? '1 byte' : `${count} bytes`),
    kilobytes: 'KB',
    megabytes: 'MB',
    gigabytes: 'GB',
    terabytes: 'TB',
  },
  today: (time: string) => `Today at ${time}`,
  yesterday: (time: string) => `Yesterday at ${time}`,
  tags: {
    section: 'Tags',
    colors: {
      red: 'Red',
      orange: 'Orange',
      yellow: 'Yellow',
      green: 'Green',
      blue: 'Blue',
      purple: 'Purple',
      grey: 'Grey',
    } satisfies Record<TagColor, string>,
    noColor: 'None',
    /** The word a search takes a tag with, `tag:Red`, besides the English one. */
    keyword: 'tag',
    field: 'Tags',
    fieldPlaceholder: 'Add Tags…',
    menu: 'Tags…',
    button: 'Tags',
    editTitle: (count: number, name: string) =>
      count === 1 ? `Tags of “${name}”` : `Tags of ${count} Items`,
    add: (name: string) => `Add Tag “${name}”`,
    remove: (name: string) => `Remove Tag “${name}”`,
    removeAll: 'Remove All Tags',
    /** What a screen reader says of an item's tags, after its other facts. */
    spoken: (names: readonly string[]) =>
      names.length === 1 ? `Tag ${names[0]}` : `Tags ${names.join(', ')}`,
    noTags: 'No Tags',
    allTags: 'All Tags…',
    showInSidebar: 'Show in Sidebar',
    removeFromSidebar: 'Remove from Sidebar',
    renameTag: 'Rename Tag…',
    /** The name of a tag's menu button ("…"), never the tag's own name, which its row has. */
    options: (name: string) => `Options for ${name}`,
    deleteTag: 'Delete Tag…',
    newTag: 'New Tag',
    color: 'Colour',
    deleteTitle: (name: string) => `Delete the tag “${name}”?`,
    deleteBody: 'It is removed from every item that has it.',
    deleteAction: 'Delete Tag',
    renameTitle: 'Rename Tag',
    tagName: 'Tag name',
    empty: (name: string) => `Nothing is tagged “${name}”`,
    emptyHint: 'Items you give this tag appear here, from this device and Oxy Files.',
    problems: {
      empty: 'A tag needs a name.',
      separator: 'A tag’s name cannot contain a comma or a line break.',
      'too-long': 'That name is too long for a tag.',
      taken: 'A tag with that name already exists.',
    } satisfies Record<TagNameProblem, string>,
    couldNotChange: (count: number) =>
      count === 1
        ? 'The tags of one item could not be changed.'
        : `The tags of ${count} items could not be changed.`,
    settingsTitle: 'Tags',
    settingsHint:
      'Your tags, in the order the sidebar and menus show them. Drag to reorder; renaming a tag renames it on every item.',
  },
  settings: 'Settings…',
  getInfo: 'Get Info',
  info: (name: string) => `“${name}” Info`,
  infoOfItems: (count: number) => `${count} Items Info`,
  groupBy: 'Group By',
  useGroups: 'Use Groups',
  noGroups: 'None',
  /** The headers of the periods View › Group By › Date Modified puts items in, as Finder's. */
  periods: {
    today: 'Today',
    yesterday: 'Yesterday',
    'previous-7-days': 'Previous 7 Days',
    'previous-30-days': 'Previous 30 Days',
    undated: 'No Date',
  },
  untitledFolder: 'untitled folder',
  /** What Duplicate names a copy with: “notes copy.txt”. */
  copyWord: 'copy',
  /** Edit › Undo and Redo (ADR 0002). */
  undo: {
    actions: {
      move: 'Move',
      copy: 'Copy',
      duplicate: 'Duplicate',
      rename: 'Rename',
      'new-folder': 'New Folder',
      trash: 'Move to Trash',
      'put-back': 'Put Back',
      tags: 'Change Tags',
    } satisfies Record<UndoAction, string>,
    /** A step as Finder's Edit menu names it: “Move of “Facturas””, “Move of 3 Items”. */
    step: (action: string, count: number, name: string) =>
      count === 1 ? `${action} of “${name}”` : `${action} of ${count} Items`,
    undo: (step: string) => `Undo ${step}`,
    redo: (step: string) => `Redo ${step}`,
    /** What the screen reader says once it is done. */
    undone: (step: string) => `Undone: ${step}`,
    redone: (step: string) => `Redone: ${step}`,
    problems: {
      gone: (name: string) =>
        `The operation can’t be completed because the original item for “${name}” can’t be found.`,
      taken: (name: string) =>
        `The operation can’t be completed because an item with the name “${name}” already exists.`,
      'folder-gone': (name: string) =>
        `The operation can’t be completed because the folder “${name}” can’t be found.`,
      'tags-changed': (name: string) =>
        `The operation can’t be completed because the tags of “${name}” have changed.`,
      file: 'The operation can’t be completed.',
    },
    nothingChanged: 'Nothing was changed.',
    partlyChanged: 'Some items were changed.',
  },
  untitledAlbum: 'Untitled Album',
  menus: {
    file: 'File',
    edit: 'Edit',
    view: 'View',
    go: 'Go',
    newFolder: 'New Folder',
    newAlbum: 'New Album',
    open: 'Open',
    preview: 'Quick Look',
    rename: 'Rename',
    moveToTrash: 'Move to Trash',
    deleteForGood: 'Delete…',
    putBack: 'Put Back',
    deleteImmediately: 'Delete Immediately…',
    emptyTrash: 'Empty Trash…',
    upload: 'Upload to Oxy Files',
    uploadFiles: 'Upload Files…',
    download: 'Download',
    downloadTo: 'Download To',
    addToAlbum: 'Add to Album',
    removeFromAlbum: 'Remove from Album',
    renameAlbum: 'Rename Album…',
    deleteAlbum: 'Delete Album…',
    duplicate: 'Duplicate',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    find: 'Find…',
    showHidden: 'Show Hidden Files',
    showSidebar: 'Show Sidebar',
    hideSidebar: 'Hide Sidebar',
    showPreview: 'Show Preview',
    hidePreview: 'Hide Preview',
    showPathBar: 'Show Path Bar',
    hidePathBar: 'Hide Path Bar',
    sortBy: 'Sort By',
    enclosing: 'Enclosing Folder',
    signIn: 'Sign In…',
  },
  rename: 'Name',
  select: 'Select',
  ascending: 'ascending',
  descending: 'descending',
  cancel: 'Cancel',
  ok: 'OK',
  save: 'Save',
  retry: 'Try Again',
  confirm: {
    emptyTrash: (count: number) =>
      count === 1
        ? 'Delete the item in the Trash for good?'
        : `Delete the ${count} items in the Trash for good?`,
    emptyTrashAction: 'Empty Trash',
    deleteImmediately: (count: number) =>
      count === 1 ? 'Delete this item for good?' : `Delete these ${count} items for good?`,
    deleteForGood: (count: number) =>
      count === 1
        ? 'Delete this item? This device has no Trash to put it in.'
        : `Delete these ${count} items? This device has no Trash to put them in.`,
    deleteAction: 'Delete',
    cannotUndo: 'This cannot be undone.',
    deleteAlbum: (name: string) => `Delete the album “${name}”?`,
    deleteAlbumBody: 'Its photos stay in Oxy Files.',
    deleteAlbumAction: 'Delete Album',
  },
  albumName: 'Album name',
  renameAlbumTitle: 'Rename Album',
  nameProblems: {
    empty: 'A name cannot be empty.',
    slash: 'A name cannot contain “/”.',
    dots: 'A name cannot be “.” or “..”.',
    'too-long': 'That name is too long.',
    taken: 'An item with that name is already here. Choose another name.',
  } satisfies Record<NameProblem, string>,
  fileProblems: {
    'not-found': 'The item is no longer there.',
    exists: 'An item with that name is already there.',
    refused: 'Dropsea cannot change that item.',
    denied: 'You do not have permission to do that.',
    io: 'The disk could not do that.',
    unavailable: 'Files on this device are not available.',
  } satisfies Record<FileProblem, string>,
  placeStays: (name: string) => `“${name}” can’t be moved: the system keeps it where it is.`,
  couldNotLoad: 'Dropsea could not load this.',
  notAvailableYet: {
    title: 'Not Available Yet',
    hint: 'This needs Dropsea’s online service, which is not available yet.',
  },
  couldNotOpenFolder: 'Dropsea could not open this folder.',
  couldNotChange: 'Dropsea could not do that. Try again.',
  cloudProblem: (name: string) => `Oxy Files could not change “${name}”.`,
  transfers: {
    uploading: (count: number, percent: string) =>
      count === 1 ? `Uploading 1 item… ${percent}` : `Uploading ${count} items… ${percent}`,
    uploaded: (count: number) =>
      count === 1 ? 'Uploaded 1 item to Oxy Files' : `Uploaded ${count} items to Oxy Files`,
    uploadFailed: (name: string) => `“${name}” could not be uploaded.`,
    skippedFolders: (count: number) =>
      count === 1
        ? 'A folder was left out: Oxy Files keeps files, not folders.'
        : `${count} folders were left out: Oxy Files keeps files, not folders.`,
    downloading: (count: number, percent: string) =>
      count === 1 ? `Downloading 1 item… ${percent}` : `Downloading ${count} items… ${percent}`,
    downloaded: (count: number, place: string) =>
      count === 1 ? `Downloaded 1 item to ${place}` : `Downloaded ${count} items to ${place}`,
    downloadFailed: (name: string) => `“${name}” could not be downloaded.`,
    addedToAlbum: (count: number, album: string) =>
      count === 1 ? `Added 1 photo to “${album}”` : `Added ${count} photos to “${album}”`,
    rejected: (count: number) =>
      count === 1
        ? 'One item is not a photo Dropsea can read, and was not added.'
        : `${count} items are not photos Dropsea can read, and were not added.`,
    relocating: (relocation: 'copy' | 'move', count: number, folder: string) =>
      `${relocation === 'copy' ? 'Copying' : 'Moving'} ${count === 1 ? '1 item' : `${count} items`} to “${folder}”`,
    stopping: 'Stopping…',
    stop: 'Stop',
  },
  backups: {
    browseVersions: 'Browse Versions…',
    browseBackups: 'Browse Backups',
    versionsTitle: (name: string) => `Versions of “${name}”`,
    versions: 'Versions',
    looking: 'Looking through your backups…',
    noVersions: (name: string) => `No backup holds “${name}” yet.`,
    onDestination: (size: string | null, destination: string) =>
      size ? `${size} · ${destination}` : destination,
    unknownDestination: 'Backup',
    restore: 'Restore',
    restoreTo: 'Restore To…',
    done: 'Done',
    stop: 'Stop',
    clashTitle: (name: string) =>
      `An item named “${name}” already exists in this location. Do you want to keep both, or replace it with the one from the backup?`,
    restoring: (name: string, percent: string | null) =>
      percent ? `Restoring “${name}”… ${percent}` : `Restoring “${name}”…`,
    restored: (name: string) => `Restored “${name}”`,
    restoredItems: (count: number) => (count === 1 ? 'Restored 1 item' : `Restored ${count} items`),
    skipped: (count: number) =>
      count === 1
        ? 'One item was left out: a link leading outside what was restored, or a device.'
        : `${count} items were left out: links leading outside what was restored, or devices.`,
    couldNotRestore: (name: string) => `“${name}” could not be restored.`,
    couldNotRead: 'Dropsea could not read your backups.',
    problems: {
      disk: (name: string) => `The backup disk “${name}” isn’t connected.`,
      share: (name: string) => `“${name}” can’t be reached right now.`,
      'not-permitted': 'Dropsea isn’t allowed to read your backups.',
      'not-found': 'The backup no longer holds this item.',
      refused: 'Dropsea can’t restore an item there.',
      denied: 'You do not have permission to restore an item there.',
      io: 'The disk could not do that.',
    },
    backupsTitle: (folder: string) => `Backups of “${folder}”`,
    timeline: 'Backups',
    noBackups: (folder: string) => `No backup holds “${folder}” yet.`,
    notInBackup: 'This folder isn’t in this backup.',
    emptyFolder: 'This folder was empty.',
    notHereNow: 'Not here now',
    enclosing: 'Enclosing Folder',
    open: (name: string) => `Open “${name}”`,
    selectItem: (name: string) => `Select “${name}”`,
    preview: 'Preview',
    noPreview: 'No preview for this version.',
    folderVersion: 'The folder as it was',
  },
  clash: {
    title: (name: string, relocation: 'copy' | 'move') =>
      `An item named “${name}” already exists in this location. Do you want to replace it with the one you’re ${relocation === 'copy' ? 'copying' : 'moving'}?`,
    keepBoth: 'Keep Both',
    stop: 'Stop',
    replace: 'Replace',
    applyToAll: 'Apply to All',
  },
  preview: {
    kind: 'Kind',
    size: 'Size',
    modified: 'Modified',
    deleted: 'Deleted',
    dimensions: 'Dimensions',
    where: 'Where',
    noPreview: 'No preview for this kind of file.',
    couldNotRead: 'Dropsea could not read this file.',
  },
  origins: {
    cloud: 'Oxy Files',
    unknown: 'Unknown',
  },
  chooser: {
    open: 'Open',
    chooseFolder: 'Choose a Folder',
    save: 'Save',
    saveAs: 'Save As:',
    name: 'Name',
    replaceTitle: (name: string) => `“${name}” already exists. Do you want to replace it?`,
    replaceBody: (folder: string) =>
      `An item with the same name is already in “${folder}”. Replacing it overwrites what it holds.`,
    replace: 'Replace',
    folderTaken: 'A folder with that name is already here. Choose another name.',
  },
};

export type Strings = typeof en;

const es: Strings = {
  appName: 'Dropsea',
  sections: {
    favourites: 'Favoritos',
    locations: 'Ubicaciones',
    oxy: 'Oxy',
    albums: 'Álbumes',
  },
  places: {
    home: 'Inicio',
    desktop: 'Escritorio',
    documents: 'Documentos',
    downloads: 'Descargas',
    pictures: 'Imágenes',
    music: 'Música',
    videos: 'Vídeos',
    volume: 'Volumen',
    device: 'En este dispositivo',
  },
  cloud: 'Oxy Files',
  photos: 'Fotos',
  albums: 'Álbumes',
  trash: 'Papelera',
  back: 'Atrás',
  forward: 'Adelante',
  path: 'Ruta',
  computer: 'Ordenador',
  resizePreview: 'Cambiar el ancho de la vista previa',
  noSelection: 'Sin selección',
  view: 'Visualización',
  asIcons: 'como iconos',
  asList: 'como lista',
  search: 'Buscar',
  searchIn: (place) => `Buscar en «${place}»`,
  searching: {
    scope: 'Buscar:',
    scopeLabel: 'Ámbito de la búsqueda',
    thisComputer: 'Este ordenador',
    folder: (name) => `«${name}»`,
    indexing: 'Indexando…',
    noResults: (query) => `No hay resultados para «${query}»`,
    suggestions: 'Sugerencias de búsqueda',
    sections: { kinds: 'Clases', tags: 'Etiquetas', dates: 'Fechas' },
    nameMatches: (text) => `El nombre coincide con «${text}»`,
    filters: { category: 'Clase', tag: 'Etiqueta', date: 'Fecha', name: 'Nombre' },
    kinds: {
      pdf: { name: 'PDF', aliases: [] },
      image: { name: 'Imagen', aliases: ['Foto', 'Fotografía'] },
      folder: { name: 'Carpeta', aliases: ['Directorio'] },
      document: { name: 'Documento', aliases: [] },
      presentation: { name: 'Presentación', aliases: ['Diapositivas'] },
      spreadsheet: { name: 'Hoja de cálculo', aliases: [] },
      text: { name: 'Texto', aliases: [] },
      source: { name: 'Desarrollo', aliases: ['Código', 'Fuente'] },
      movie: { name: 'Película', aliases: ['Vídeo', 'Video'] },
      music: { name: 'Música', aliases: ['Audio', 'Canción'] },
      archive: { name: 'Archivo comprimido', aliases: ['Zip', 'Comprimido'] },
    },
    dates: {
      today: 'Hoy',
      yesterday: 'Ayer',
      week: 'Esta semana',
      month: 'Este mes',
      year: 'Este año',
    },
  },
  columns: {
    name: 'Nombre',
    date: 'Fecha de modificación',
    deleted: 'Fecha de eliminación',
    taken: 'Fecha',
    size: 'Tamaño',
    kind: 'Clase',
    origin: 'Procedencia',
    location: 'Ubicación',
    tags: 'Etiquetas',
  },
  kinds: {
    folder: 'Carpeta',
    album: 'Álbum',
    image: 'Imagen',
    audio: 'Audio',
    video: 'Vídeo',
    pdf: 'Documento PDF',
    text: 'Texto sin formato',
    code: 'Código fuente',
    document: 'Documento',
    spreadsheet: 'Hoja de cálculo',
    presentation: 'Presentación',
    archive: 'Archivo comprimido',
    'disk-image': 'Imagen de disco',
    font: 'Tipo de letra',
    file: 'Documento',
  },
  photoCount: (count) => (count === 1 ? '1 foto' : `${count} fotos`),
  items: (count) => (count === 1 ? '1 elemento' : `${count} elementos`),
  selected: (count, of) => `${count} de ${of} seleccionados`,
  empty: {
    folder: 'Esta carpeta está vacía',
    trash: 'La papelera está vacía',
    cloud: 'Aún no hay nada en Oxy Files',
    cloudHint:
      'Lo que subas a Oxy Files aparece aquí, en cada dispositivo en el que inicies sesión.',
    photos: 'Aún no hay fotos',
    photosHint: 'Las fotos y los vídeos que guardes en Oxy Files aparecen aquí.',
    albums: 'Aún no hay álbumes',
    albumsHint: 'Crea un álbum para tener fotos juntas.',
    album: 'Este álbum está vacío',
    albumHint: 'Añade fotos desde Fotos u Oxy Files.',
    noResults: (query) => `Aquí no hay nada llamado «${query}»`,
  },
  signIn: {
    cloudTitle: 'Tus archivos, en cada dispositivo',
    cloudBody: 'Inicia sesión con Oxy para ver aquí Oxy Files, tus fotos y tus álbumes.',
  },
  units: {
    bytes: (count) => (count === 1 ? '1 byte' : `${count} bytes`),
    kilobytes: 'KB',
    megabytes: 'MB',
    gigabytes: 'GB',
    terabytes: 'TB',
  },
  today: (time) => `Hoy a las ${time}`,
  yesterday: (time) => `Ayer a las ${time}`,
  tags: {
    section: 'Etiquetas',
    colors: {
      red: 'Rojo',
      orange: 'Naranja',
      yellow: 'Amarillo',
      green: 'Verde',
      blue: 'Azul',
      purple: 'Morado',
      grey: 'Gris',
    },
    noColor: 'Ninguno',
    keyword: 'etiqueta',
    field: 'Etiquetas',
    fieldPlaceholder: 'Añadir etiquetas…',
    menu: 'Etiquetas…',
    button: 'Etiquetas',
    editTitle: (count, name) =>
      count === 1 ? `Etiquetas de “${name}”` : `Etiquetas de ${count} elementos`,
    add: (name) => `Añadir la etiqueta “${name}”`,
    remove: (name) => `Quitar la etiqueta “${name}”`,
    removeAll: 'Quitar todas las etiquetas',
    spoken: (names) =>
      names.length === 1 ? `Etiqueta ${names[0]}` : `Etiquetas ${names.join(', ')}`,
    noTags: 'Sin etiquetas',
    allTags: 'Todas las etiquetas…',
    showInSidebar: 'Mostrar en la barra lateral',
    removeFromSidebar: 'Quitar de la barra lateral',
    renameTag: 'Renombrar etiqueta…',
    options: (name: string) => `Opciones de ${name}`,
    deleteTag: 'Eliminar etiqueta…',
    newTag: 'Etiqueta nueva',
    color: 'Color',
    deleteTitle: (name) => `¿Eliminar la etiqueta “${name}”?`,
    deleteBody: 'Se quita de todos los elementos que la tienen.',
    deleteAction: 'Eliminar etiqueta',
    renameTitle: 'Renombrar etiqueta',
    tagName: 'Nombre de la etiqueta',
    empty: (name) => `No hay nada con la etiqueta “${name}”`,
    emptyHint: 'Lo que tenga esta etiqueta aparece aquí, de este dispositivo y de Oxy Files.',
    problems: {
      empty: 'Una etiqueta necesita un nombre.',
      separator: 'El nombre de una etiqueta no puede tener comas ni saltos de línea.',
      'too-long': 'Ese nombre es demasiado largo para una etiqueta.',
      taken: 'Ya hay una etiqueta con ese nombre.',
    },
    couldNotChange: (count) =>
      count === 1
        ? 'No se han podido cambiar las etiquetas de un elemento.'
        : `No se han podido cambiar las etiquetas de ${count} elementos.`,
    settingsTitle: 'Etiquetas',
    settingsHint:
      'Tus etiquetas, en el orden en que las muestran la barra lateral y los menús. Arrastra para ordenarlas; renombrar una etiqueta la renombra en todos los elementos.',
  },
  settings: 'Ajustes…',
  getInfo: 'Obtener información',
  info: (name) => `Información de “${name}”`,
  infoOfItems: (count) => `Información de ${count} elementos`,
  groupBy: 'Agrupar por',
  useGroups: 'Usar grupos',
  noGroups: 'Ninguno',
  periods: {
    today: 'Hoy',
    yesterday: 'Ayer',
    'previous-7-days': '7 días anteriores',
    'previous-30-days': '30 días anteriores',
    undated: 'Sin fecha',
  },
  untitledFolder: 'carpeta sin título',
  copyWord: 'copia',
  undo: {
    // Each a noun with its article, as the Spanish Finder names a step: «el traslado de «Facturas»».
    actions: {
      move: 'el traslado',
      copy: 'la copia',
      duplicate: 'el duplicado',
      rename: 'el cambio de nombre',
      'new-folder': 'la creación',
      trash: 'el traslado a la papelera',
      'put-back': 'la devolución',
      tags: 'el cambio de etiquetas',
    },
    step: (action, count, name) =>
      count === 1 ? `${action} de «${name}»` : `${action} de ${count} elementos`,
    undo: (step) => `Deshacer ${step}`,
    redo: (step) => `Rehacer ${step}`,
    undone: (step) => `Deshecho: ${step}`,
    redone: (step) => `Rehecho: ${step}`,
    problems: {
      gone: (name) =>
        `No se puede completar la operación porque no se encuentra el ítem original de «${name}».`,
      taken: (name) =>
        `No se puede completar la operación porque ya existe un ítem con el nombre «${name}».`,
      'folder-gone': (name) =>
        `No se puede completar la operación porque no se encuentra la carpeta «${name}».`,
      'tags-changed': (name) =>
        `No se puede completar la operación porque las etiquetas de «${name}» han cambiado.`,
      file: 'No se puede completar la operación.',
    },
    nothingChanged: 'No se ha cambiado nada.',
    partlyChanged: 'Algunos elementos sí se han cambiado.',
  },
  untitledAlbum: 'Álbum sin título',
  menus: {
    file: 'Archivo',
    edit: 'Edición',
    view: 'Visualización',
    go: 'Ir',
    newFolder: 'Nueva carpeta',
    newAlbum: 'Nuevo álbum',
    open: 'Abrir',
    preview: 'Vista rápida',
    rename: 'Renombrar',
    moveToTrash: 'Trasladar a la papelera',
    deleteForGood: 'Eliminar…',
    putBack: 'Devolver',
    deleteImmediately: 'Eliminar inmediatamente…',
    emptyTrash: 'Vaciar papelera…',
    upload: 'Subir a Oxy Files',
    uploadFiles: 'Subir archivos…',
    download: 'Descargar',
    downloadTo: 'Descargar en',
    addToAlbum: 'Añadir al álbum',
    removeFromAlbum: 'Quitar del álbum',
    renameAlbum: 'Renombrar álbum…',
    deleteAlbum: 'Eliminar álbum…',
    duplicate: 'Duplicar',
    undo: 'Deshacer',
    redo: 'Rehacer',
    cut: 'Cortar',
    copy: 'Copiar',
    paste: 'Pegar',
    selectAll: 'Seleccionar todo',
    find: 'Buscar…',
    showHidden: 'Mostrar archivos ocultos',
    showSidebar: 'Mostrar barra lateral',
    hideSidebar: 'Ocultar barra lateral',
    showPreview: 'Mostrar vista previa',
    hidePreview: 'Ocultar vista previa',
    showPathBar: 'Mostrar barra de ruta',
    hidePathBar: 'Ocultar barra de ruta',
    sortBy: 'Ordenar por',
    enclosing: 'Carpeta contenedora',
    signIn: 'Iniciar sesión…',
  },
  rename: 'Nombre',
  select: 'Seleccionar',
  ascending: 'ascendente',
  descending: 'descendente',
  cancel: 'Cancelar',
  ok: 'Aceptar',
  save: 'Guardar',
  retry: 'Reintentar',
  confirm: {
    emptyTrash: (count) =>
      count === 1
        ? '¿Eliminar para siempre el elemento de la papelera?'
        : `¿Eliminar para siempre los ${count} elementos de la papelera?`,
    emptyTrashAction: 'Vaciar papelera',
    deleteImmediately: (count) =>
      count === 1
        ? '¿Eliminar este elemento para siempre?'
        : `¿Eliminar estos ${count} elementos para siempre?`,
    deleteForGood: (count) =>
      count === 1
        ? '¿Eliminar este elemento? Este dispositivo no tiene papelera donde dejarlo.'
        : `¿Eliminar estos ${count} elementos? Este dispositivo no tiene papelera donde dejarlos.`,
    deleteAction: 'Eliminar',
    cannotUndo: 'No se puede deshacer.',
    deleteAlbum: (name) => `¿Eliminar el álbum «${name}»?`,
    deleteAlbumBody: 'Sus fotos se quedan en Oxy Files.',
    deleteAlbumAction: 'Eliminar álbum',
  },
  albumName: 'Nombre del álbum',
  renameAlbumTitle: 'Renombrar álbum',
  nameProblems: {
    empty: 'Un nombre no puede estar vacío.',
    slash: 'Un nombre no puede contener «/».',
    dots: 'Un nombre no puede ser «.» ni «..».',
    'too-long': 'Ese nombre es demasiado largo.',
    taken: 'Ya hay un elemento con ese nombre aquí. Elige otro.',
  },
  fileProblems: {
    'not-found': 'El elemento ya no está ahí.',
    exists: 'Ya hay un elemento con ese nombre ahí.',
    refused: 'Dropsea no puede cambiar ese elemento.',
    denied: 'No tienes permiso para hacerlo.',
    io: 'El disco no ha podido hacerlo.',
    unavailable: 'Los archivos de este dispositivo no están disponibles.',
  },
  placeStays: (name) => `«${name}» no se puede mover: el sistema lo mantiene donde está.`,
  couldNotLoad: 'Dropsea no ha podido cargar esto.',
  notAvailableYet: {
    title: 'Aún no disponible',
    hint: 'Esto necesita el servicio en línea de Dropsea, que aún no está disponible.',
  },
  couldNotOpenFolder: 'Dropsea no ha podido abrir esta carpeta.',
  couldNotChange: 'Dropsea no ha podido hacerlo. Inténtalo de nuevo.',
  cloudProblem: (name) => `Oxy Files no ha podido cambiar «${name}».`,
  transfers: {
    uploading: (count, percent) =>
      count === 1 ? `Subiendo 1 elemento… ${percent}` : `Subiendo ${count} elementos… ${percent}`,
    uploaded: (count) =>
      count === 1
        ? 'Se ha subido 1 elemento a Oxy Files'
        : `Se han subido ${count} elementos a Oxy Files`,
    uploadFailed: (name) => `No se ha podido subir «${name}».`,
    skippedFolders: (count) =>
      count === 1
        ? 'Se ha dejado fuera una carpeta: Oxy Files guarda archivos, no carpetas.'
        : `Se han dejado fuera ${count} carpetas: Oxy Files guarda archivos, no carpetas.`,
    downloading: (count, percent) =>
      count === 1
        ? `Descargando 1 elemento… ${percent}`
        : `Descargando ${count} elementos… ${percent}`,
    downloaded: (count, place) =>
      count === 1
        ? `Se ha descargado 1 elemento en ${place}`
        : `Se han descargado ${count} elementos en ${place}`,
    downloadFailed: (name) => `No se ha podido descargar «${name}».`,
    addedToAlbum: (count, album) =>
      count === 1
        ? `Se ha añadido 1 foto a «${album}»`
        : `Se han añadido ${count} fotos a «${album}»`,
    rejected: (count) =>
      count === 1
        ? 'Un elemento no es una foto que Dropsea pueda leer y no se ha añadido.'
        : `${count} elementos no son fotos que Dropsea pueda leer y no se han añadido.`,
    relocating: (relocation, count, folder) =>
      `${relocation === 'copy' ? 'Copiando' : 'Trasladando'} ${count === 1 ? '1 elemento' : `${count} elementos`} a «${folder}»`,
    stopping: 'Deteniendo…',
    stop: 'Detener',
  },
  backups: {
    browseVersions: 'Explorar versiones…',
    browseBackups: 'Explorar copias de seguridad',
    versionsTitle: (name) => `Versiones de «${name}»`,
    versions: 'Versiones',
    looking: 'Buscando en tus copias de seguridad…',
    noVersions: (name) => `Ninguna copia de seguridad contiene «${name}» todavía.`,
    onDestination: (size, destination) => (size ? `${size} · ${destination}` : destination),
    unknownDestination: 'Copia de seguridad',
    restore: 'Restaurar',
    restoreTo: 'Restaurar en…',
    done: 'Listo',
    stop: 'Detener',
    clashTitle: (name) =>
      `Ya hay un elemento llamado «${name}» en esta ubicación. ¿Quieres conservar ambos o reemplazarlo por el de la copia de seguridad?`,
    restoring: (name, percent) =>
      percent ? `Restaurando «${name}»… ${percent}` : `Restaurando «${name}»…`,
    restored: (name) => `Se ha restaurado «${name}»`,
    restoredItems: (count) =>
      count === 1 ? 'Se ha restaurado 1 elemento' : `Se han restaurado ${count} elementos`,
    skipped: (count) =>
      count === 1
        ? 'Se ha omitido un elemento: un enlace que lleva fuera de lo restaurado, o un dispositivo.'
        : `Se han omitido ${count} elementos: enlaces que llevan fuera de lo restaurado, o dispositivos.`,
    couldNotRestore: (name) => `No se ha podido restaurar «${name}».`,
    couldNotRead: 'Dropsea no ha podido leer tus copias de seguridad.',
    problems: {
      disk: (name) => `El disco de copias de seguridad «${name}» no está conectado.`,
      share: (name) => `No se puede acceder a «${name}» en este momento.`,
      'not-permitted': 'Dropsea no tiene permiso para leer tus copias de seguridad.',
      'not-found': 'La copia de seguridad ya no contiene este elemento.',
      refused: 'Dropsea no puede restaurar un elemento ahí.',
      denied: 'No tienes permiso para restaurar un elemento ahí.',
      io: 'El disco no ha podido hacerlo.',
    },
    backupsTitle: (folder) => `Copias de seguridad de «${folder}»`,
    timeline: 'Copias de seguridad',
    noBackups: (folder) => `Ninguna copia de seguridad contiene «${folder}» todavía.`,
    notInBackup: 'Esta carpeta no está en esta copia de seguridad.',
    emptyFolder: 'Esta carpeta estaba vacía.',
    notHereNow: 'Ya no está aquí',
    enclosing: 'Carpeta contenedora',
    open: (name) => `Abrir «${name}»`,
    selectItem: (name) => `Seleccionar «${name}»`,
    preview: 'Vista previa',
    noPreview: 'No hay vista previa de esta versión.',
    folderVersion: 'La carpeta tal como estaba',
  },
  clash: {
    title: (name, relocation) =>
      `Ya hay un elemento llamado «${name}» en esta ubicación. ¿Quieres reemplazarlo por el que estás ${relocation === 'copy' ? 'copiando' : 'trasladando'}?`,
    keepBoth: 'Conservar ambos',
    stop: 'Detener',
    replace: 'Reemplazar',
    applyToAll: 'Aplicar a todos',
  },
  preview: {
    kind: 'Clase',
    size: 'Tamaño',
    modified: 'Modificado',
    deleted: 'Eliminado',
    dimensions: 'Dimensiones',
    where: 'Ubicación',
    noPreview: 'No hay vista previa para esta clase de archivo.',
    couldNotRead: 'Dropsea no ha podido leer este archivo.',
  },
  origins: {
    cloud: 'Oxy Files',
    unknown: 'Desconocida',
  },
  chooser: {
    open: 'Abrir',
    chooseFolder: 'Elegir una carpeta',
    save: 'Guardar',
    saveAs: 'Guardar como:',
    name: 'Nombre',
    replaceTitle: (name) => `«${name}» ya existe. ¿Quieres reemplazarlo?`,
    replaceBody: (folder) =>
      `Ya hay un elemento con el mismo nombre en «${folder}». Si lo reemplazas, se sobrescribe lo que contiene.`,
    replace: 'Reemplazar',
    folderTaken: 'Ya hay una carpeta con ese nombre aquí. Elige otro nombre.',
  },
};

/** The locales Dropsea ships words for, as `OxyProvider language` takes them. */
export const SUPPORTED_LOCALES = ['en', 'es'] as const;
export const FALLBACK_LOCALE = 'en';

/** The words for a BCP 47 locale ("es-ES", "en"): Spanish for Spanish, English otherwise. */
export function stringsFor(locale: string): Strings {
  return locale.toLowerCase().split(/[-_]/)[0] === 'es' ? es : en;
}
