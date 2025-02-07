import React, { useState, useRef, useEffect,  } from 'react';
import axios from 'axios';
import Quotation from './quotation';
import Text from './Text';
import './App.css';
import Split from "react-split";
import { LibraryBig, BookOpenText, Search } from 'lucide-react';
import { useMediaQuery } from "react-responsive";

const REACT_APP_BACKEND_URL='https://bahai-vector-search.onrender.com';
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
    setSelectedIndex(-1);
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
    // setBackToResult(!backToResult);
	return (
	  <div>
		{response.map((r, i) => (
		  <React.Fragment key={i}>
			<div>
			  <Quotation class={i === selectedIndex ? 'selected-result' : ''} {...r} index={i} fullTextCallback={fullTextCallback} url={REACT_APP_BACKEND_URL} handleScroll={handleScroll}></Quotation>
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
      <div class='book-title'>
        <strong>
        {book}
        </strong>
        
      </div>
    );

  }

  // ----------------------------------------------------------------------------------------------
  // DESKTOP VIEW

  const SplitPanel = () => {
    return (
      <div class='container'>
      <Split
      className="split-container"
      sizes={[50, 50]} // Initial sizes (percent)
      minSize={100} // Minimum size of each panel
      gutterSize={10} // Width of draggable gutter
      gutter={(index, direction) => {
        const gutter = document.createElement("div");
        gutter.className = `gutter gutter-${direction}`;
        gutter.innerHTML = `<span class="grip-vertical">☰</span>`; // Grip icon
        return gutter;
      }}
    >
        {/* Panel 1 */}
        <div class="search-results-container">
          <div class='panel-menu'>
              <div class='panel-header'> 
              <LibraryBig class="icon" size={25}></LibraryBig>
                  <div class='panel-header-text'><strong>Results</strong></div>
              </div>
          </div>
        {response && <p style={{ marginTop: '0px' }}>{handleResponse(response)}</p>}
      </div>
  
        {/* Panel 2 */}
          <div id='fulltext' class="full-text-container">
              <div class='panel-menu'>
                  <div class='panel-header'> 
                      <BookOpenText class="icon" size={25}></BookOpenText>
                      <div class='panel-header-text'><strong>Text</strong></div>
                  </div>
                  {book && handleDisplayBook()}
              </div>
              {fullText && handleFullText()}
          </div>
      </Split>
      </div>
    );
  };
  // ----------------------------------------------------------------------------------------------
  // MOBILE VIEW

  const showFullTextMobile = () => {
    return (
      <div id='fulltext' class="full-text-container" ref={mobileDivRef}>
      <div class='panel-menu'>
          <div class='panel-header'> 
              <BookOpenText class="icon" size={25}></BookOpenText>
              <div class='panel-header-text'><strong>Text</strong></div>
          </div>
          {book && handleDisplayBook()}
      </div>
        {fullText && handleFullText()}
      </div>
    );
  };

  const showResultsMobile = () => {
    return (
    <div class="search-results-container">
      <div class='panel-menu'>
        <div class='panel-header'> 
        <LibraryBig class="icon" size={25}></LibraryBig>
            <div class='panel-header-text'><strong>Results</strong></div>
        </div>
      </div>
      {response && <p style={{ marginTop: '0px' }}>{handleResponse(response)}</p>}
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
    <div class='mobile-container' ref={mobileDivRef}>
      {toggleFullText ? showFullTextMobile() : showResultsMobile()}
      <div class='mobile-toggle-bar'>
      <LibraryBig class="button-icon icon" size={32} color='white' onClick={mobileResultsButton}></LibraryBig>
      <BookOpenText class="button-icon icon" size={32} color='white' onClick={mobileTextButton}></BookOpenText>
      <Search class="button-icon icon" size={32} color='white' onClick={handleSubmit}></Search>
      </div>
    </div>
    );
  }


  // ----------------------------------------------------------------------------------------------

  return (
    <div class='outer-container'>
	  {/* SEARCH BAR */}
    
      <div class='search-bar-container'>
      <div class='search-filler'></div>
      <form onSubmit={handleSubmit} class='search-form'>
        <input
          class="search-input"
          type="text"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      </div>
      <div class='search-filler'></div>
	  
	  {/* Search Results */}
    {isMobile ? handleMobileDisplay() : SplitPanel()}
    </div>
  );
}

export default App;
