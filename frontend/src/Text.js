import React, { useState } from 'react';
import './App.css';
import { highlightSentence } from './highlightSentence';




const Text = ({ data, section_idx, sentence, highlightRef, handleBook }) => {
    if (!data) {
        return;
    }
    return (

        <div className='full-text-main'>
            {Object.keys(data.Text).map((key) => {
                const text = data.Text[key];
                const section = data.Section[key];
                const book = data.Book[key];
                const section_num = 'section' + data.idx[key];
                const isHeader = section.toLowerCase().includes("header") || section.toLowerCase().includes('title');
                const isHighlight = section_num == 'section'+section_idx;
                if (isHighlight) {
                    handleBook(book);
                }

                return (
                    <p
                        id={section_num}
                        key={key}
                        style={isHeader ? { fontWeight: 'bold', marginLeft: 0 } : {marginLeft: 0}}
                        ref={isHighlight ? highlightRef : null}
                        className={isHighlight ? 'highlight-text':''}
                    >
                        {isHighlight ? highlightSentence(text, sentence) : text}
                    </p>
                );

            })
            }
        </div>   

    );
};

export default Text;
