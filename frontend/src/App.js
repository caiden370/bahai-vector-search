import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import Quotation from './quotation';
import Text from './Text';
import './App.css';
import Split from "react-split";
import { LibraryBig, BookOpenText, Search, Info, BookOpen, Sparkles } from 'lucide-react';
import { useMediaQuery } from "react-responsive";
import Modal from "react-modal";


const REACT_APP_BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://bahai-vector-search.onrender.com';
function App() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [book, setBook] = useState('');
  const [fullText, setFullText] = useState(null);
  const highlightRef = useRef(null);
  const [highlight, setHighlight] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toggleFullText, setToggleFullText] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const mobileDivRef = useRef(null);
  const [backToResult, setBackToResult] = useState(false);
  const isMobile = useMediaQuery({ maxWidth: 768 });
  const [isOpen, setIsOpen] = useState(false);

  

  useEffect(() => {
    if (highlightRef.current) {
      // Add the highlight class
      highlightRef.current.classList.add('highlight-text');

      // Scroll to the element
      highlightRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });

    }
  }, [highlight]);


  useEffect(() => {
	if (fullText) {
	  handleScroll();
	}
  }, [fullText]);

  

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSelectedIndex(-1);
    setLoading(true);
    try {
      const res = await axios.get(`${REACT_APP_BACKEND_URL}/query`, { 
        params: {query: query}, 
        headers: {
          'Content-Type': 'application/json'
        }
      });
      setResponse(res.data.response);
    } catch (error) {
      console.error("Error fetching data from the backend:", error);
    } finally {
      setLoading(false);
    }
  };


  const fullTextCallback = (arg, i) => {
    setFullText(arg);
    setSelectedIndex(i);
    if (isMobile) {
      setToggleFullText(true);
    }
  }


  const handleResponse = (response) => {
	return (
	  <div>
		{response.map((r, i) => (
		  <React.Fragment key={i}>
			<div>
			  <Quotation className={i === selectedIndex ? 'selected-result' : ''} {...r} index={i} fullTextCallback={fullTextCallback} url={REACT_APP_BACKEND_URL} handleScroll={handleScroll} />
			</div>
		  </React.Fragment>
		))}
	  </div>
	);
  };
  
  const handleFullText = () => {
	return(
		<Text data={fullText.response} section_idx={fullText.section_idx} highlightRef={highlightRef} handleBook={setBook}></Text>
	);
  };

  const handleScroll = () => {
	  setHighlight((prev) => !prev);
	}


  const handleDisplayBook = () => {
    return (
      <div className='book-title'>
        {book}
      </div>
    );
  }

  // ----------------------------------------------------------------------------------------------
  // DESKTOP VIEW

  const EmptyResults = () => (
    <div className="empty-state">
      <Sparkles className="empty-state-icon" size={48} />
      <h3>Search the Bahá'í Writings</h3>
      <p>Enter a concept, theme, or phrase above to find relevant passages</p>
    </div>
  );

  const EmptyText = () => (
    <div className="empty-state">
      <BookOpen className="empty-state-icon" size={48} />
      <h3>Reading Pane</h3>
      <p>Click a result to view the surrounding text</p>
    </div>
  );

  const SplitPanel = () => {
    return (
      <div className='container'>
      <Split
      className="split-container"
      sizes={[50, 50]}
      minSize={100}
      gutterSize={6}
      gutter={(index, direction) => {
        const gutter = document.createElement("div");
        gutter.className = `gutter gutter-${direction}`;
        return gutter;
      }}
    >
        {/* Panel 1 */}
        <div className="search-results-container">
          <div className='panel-menu'>
              <div className='panel-header'> 
              <LibraryBig className="icon" size={18} />
                  <div className='panel-header-text'>Results</div>
              </div>
          </div>
        {loading ? <div className="loading-container">Searching...</div> : response ? handleResponse(response) : <EmptyResults />}
      </div>
  
        {/* Panel 2 */}
          <div id='fulltext' className="full-text-container">
              <div className='panel-menu'>
                  <div className='panel-header'> 
                      <BookOpenText className="icon" size={18} />
                      <div className='panel-header-text'>Text</div>
                  </div>
                  {book && handleDisplayBook()}
              </div>
              {fullText ? handleFullText() : <EmptyText />}
          </div>
      </Split>
      </div>
    );
  };
  // ----------------------------------------------------------------------------------------------
  // MOBILE VIEW

  const showFullTextMobile = () => {
    return (
      <div id='fulltext' className="full-text-container" ref={mobileDivRef}>
      <div className='panel-menu'>
          <div className='panel-header'> 
              <BookOpenText className="icon" size={18} />
              <div className='panel-header-text'>Text</div>
          </div>
          {book && handleDisplayBook()}
      </div>
        {fullText ? handleFullText() : <EmptyText />}
      </div>
    );
  };

  const showResultsMobile = () => {
    return (
    <div className="search-results-container">
      <div className='panel-menu'>
        <div className='panel-header'> 
        <LibraryBig className="icon" size={18} />
            <div className='panel-header-text'>Results</div>
        </div>
      </div>
      {loading ? <div className="loading-container">Searching...</div> : response ? handleResponse(response) : <EmptyResults />}
      </div>
    );
  };

  const mobileResultsButton = () => {
    if (mobileDivRef.current) {
      mobileDivRef.current.scrollTop = 0;
    }
    
    setToggleFullText(false);
  }

  const mobileTextButton = () => {
    setToggleFullText(true);
    if (highlightRef.current) {
      // Add the highlight class
      highlightRef.current.classList.add('highlight-text');

      // Scroll to the element
      highlightRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }

  const handleMobileDisplay = () => {
    return (
    <div className='mobile-container' ref={mobileDivRef}>
      {toggleFullText ? showFullTextMobile() : showResultsMobile()}
      <div className='mobile-toggle-bar'>
      <div className={`mobile-tab ${!toggleFullText ? 'mobile-tab-active' : ''}`} onClick={mobileResultsButton}>
        <LibraryBig size={26} />
        <span>Results</span>
      </div>
      <div className={`mobile-tab ${toggleFullText ? 'mobile-tab-active' : ''}`} onClick={mobileTextButton}>
        <BookOpenText size={26} />
        <span>Text</span>
      </div>
      </div>
    </div>
    );
  }


  // ----------------------------------------------------------------------------------------------
  // INFO POP UP 

    useEffect(() => {
      setIsOpen(true); // Open the popup when the component mounts
    }, []);

    const InfoPopUp = () => {

    return (
      <Modal
        isOpen={isOpen}
        onRequestClose={() => setIsOpen(false)}
        className="popup-modal"
        overlayClassName="popup-overlay"
        contentLabel="Welcome Popup"
      >
        <h2>Welcome!</h2>
        <p>Seek Baha'i is a powerful search tool designed to help you explore the depths 
          of the Baha'i writings using semantic search. Unlike traditional keyword searches, 
          Seek Baha'i leverages sentence embeddings and a vector database to find passages 
          based on meaning, allowing you to search for ideas, concepts, and semantically similar 
          phrases across the texts. This project originated at Princeton University as an effort 
          to make Baha'i literature more accessible and discoverable through modern machine learning
           techniques. Whether you're studying, researching, or simply exploring, Seek Baha'i aims 
           to connect you with the wisdom of the Baha'i Faith in a more intuitive way.</p>
        <button onClick={() => setIsOpen(false)}>Close</button>
      </Modal>
    );
    }


  

  return (
    <div className='outer-container'>
      {InfoPopUp()}

      {/* HEADER */}
      <div className='search-bar-container'>
        <div className='app-title'>
          <span className='app-title-star'>✦</span>
          Seek Bahá'í
        </div>
        <form onSubmit={handleSubmit} className='search-form'>
          <div className='search-input-wrapper'>
            <Search className='search-icon' size={18} />
            <input
              className="search-input"
              type="text"
              placeholder="Search the writings..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type='submit' className='search-submit-button'>
              <Search size={18} />
            </button>
          </div>
        </form>
        <button className='info-button' onClick={() => setIsOpen(true)} type='button'>
          <Info size={18} />
        </button>
      </div>

      {/* CONTENT */}
      {isMobile ? handleMobileDisplay() : SplitPanel()}
    </div>
  );
}

export default App;
