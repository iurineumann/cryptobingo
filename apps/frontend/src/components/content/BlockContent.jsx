import { useMemo, useEffect } from 'react';
import { useCreateBlockNote, BlockNoteViewRaw } from '@blocknote/react';
export default function BlockContent({ blocks }) {
    const editor = useCreateBlockNote({
        initialContent: blocks.length > 0 ? blocks : undefined,
    });
    useEffect(() => {
        if (editor) {
            editor.isEditable = false;
        }
    }, [editor]);
    const key = useMemo(() => JSON.stringify(blocks), [blocks]);
    return (<div data-testid="block-content" className="block-content">
            <BlockNoteViewRaw key={key} editor={editor}/>
        </div>);
}
//# sourceMappingURL=BlockContent.js.map