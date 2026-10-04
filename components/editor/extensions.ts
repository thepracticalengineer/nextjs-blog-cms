import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import CharacterCount from '@tiptap/extension-character-count'
import Typography from '@tiptap/extension-typography'
import { LineHeight } from './line-height'

export const extensions = [
  StarterKit.configure({
    // Keep the separately configured extensions below, without duplicate v3 registrations.
    link: false,
    underline: false,
    trailingNode: false,
    bulletList: { HTMLAttributes: { class: 'list-disc pl-6' } },
    orderedList: { HTMLAttributes: { class: 'list-decimal pl-6' } },
  }),
  // TextAlign must come after StarterKit (extends paragraph/heading nodes)
  TextAlign.configure({ types: ['paragraph', 'heading'], defaultAlignment: 'left' }),
  // TextStyle must come before Color
  TextStyle,
  Color,
  Underline,
  Highlight.configure({ multicolor: true }),
  Subscript,
  Superscript,
  TaskList,
  TaskItem.configure({ nested: true, HTMLAttributes: { class: 'tiptap-task-item' } }),
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
  CharacterCount,
  Typography,
  Image.configure({
    inline: false,
    allowBase64: false,
    HTMLAttributes: { class: 'max-w-full rounded my-4' },
  }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: { class: 'text-primary underline', rel: 'noopener noreferrer' },
  }),
  Placeholder.configure({
    placeholder: 'Start writing your post...',
  }),
  LineHeight,
]
