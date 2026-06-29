import { useMemo, useEffect } from 'react';
import { useCreateBlockNote, BlockNoteViewRaw } from '@blocknote/react';

interface BlockContentProps {
    blocks: unknown[];
}

export default function BlockContent({ blocks }: Readonly<BlockContentProps>) {
    const editor = useCreateBlockNote({
        initialContent: blocks.length > 0 ? blocks as any : undefined,
    });

    useEffect(() => {
        if (editor) {
            (editor as any).isEditable = false;
        }
    }, [editor]);

    const key = useMemo(() => JSON.stringify(blocks), [blocks]);

    return (
        <div data-testid="block-content" className="block-content">
            <BlockNoteViewRaw key={key} editor={editor} />
        </div>
    );
}
