document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const section = params.get('section') || 'banners-list';
  const status = params.get('status');
  const message = params.get('message');

  const formContainer = document.getElementById('form-container');

  if (status && message) {
    alert(decodeURIComponent(message));
    window.history.replaceState({}, document.title, window.location.pathname + '?section=' + section);
  }

  // Route to appropriate section
  switch (section) {
    case 'banners-list':
      loadBannerList();
      break;
    case 'banner-form':
      loadBannerForm();
      break;
    case 'banner-edit':
      const bannerId = params.get('id');
      loadBannerEditForm(bannerId);
      break;
    case 'protections-list':
      loadProtectionList();
      break;
    case 'protection':
    case 'protection-form':
      loadProtectionForm();
      break;
    case 'protection-edit':
      const protectionId = params.get('id');
      loadProtectionEditForm(protectionId);
      break;
    case 'banking':
      loadBankingForm();
      break;
    default:
      loadBannerList();
  }

  // === Banner Functions ===
  function loadBannerList() {
    fetch('/sudobe/api/content/banners')
      .then(res => res.json())
      .then(banners => {
        let html = `
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h2>Banners</h2>
            <a href="?section=banner-form" class="btn btn-primary">Add New Banner</a>
          </div>
          <div class="table-responsive">
            <table class="table table-bordered table-striped">
              <thead class="table-dark">
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Image</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        if (banners && banners.length > 0) {
          banners.forEach(b => {
            html += `
              <tr>
                <td>${b.id}</td>
                <td><span class="badge bg-info">${b.content?.link_type || 'N/A'}</span></td>
                <td>${b.content?.data_id || 'N/A'}</td>
                <td>
                  ${b.content?.image?.url ? 
                    `<img src="${b.content.image.url}" width="80" height="50" class="img-thumbnail" />` : 
                    '<span class="text-muted">No image</span>'
                  }
                </td>
                <td>
                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-warning" onclick="editBanner('${b.id}')">Edit</button>
                    <button class="btn btn-danger" onclick="deleteBanner('${b.id}')">Delete</button>
                  </div>
                </td>
              </tr>
            `;
          });
        } else {
          html += `
            <tr>
              <td colspan="5" class="text-center text-muted">No banners found</td>
            </tr>
          `;
        }
        
        html += `</tbody></table></div>`;
        formContainer.innerHTML = html;
      })
      .catch(error => {
        console.error('Error loading banners:', error);
        formContainer.innerHTML = '<div class="alert alert-danger">Error loading banners</div>';
      });
  }

  function loadBannerForm(editData = null) {
    const isEdit = editData !== null;
    const title = isEdit ? 'Edit Banner' : 'Create New Banner';
    const submitText = isEdit ? 'Save Banner' : 'Create Banner';
    const formAction = isEdit ? `/sudobe/api/content/banners/${editData.id}` : '/sudobe/api/content';
    const method = isEdit ? 'PUT' : 'POST';

    formContainer.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2>${title}</h2>
        <a href="?section=banners-list" class="btn btn-secondary">Back to List</a>
      </div>
      <div class="card">
        <div class="card-body">
          <form id="bannerForm" enctype="multipart/form-data">
            <div class="mb-3">
              <label class="form-label">Banner Type</label>
              <select name="bannerType" id="bannerType" class="form-select" required>
                <option value="">-- Select Type --</option>
                <option value="category" ${editData?.content?.link_type === 'category' ? 'selected' : ''}>Category</option>
                <option value="product" ${editData?.content?.link_type === 'product' ? 'selected' : ''}>Product</option>
                <option value="factory" ${editData?.content?.link_type === 'factory' ? 'selected' : ''}>Factory</option>
              </select>
            </div>
            <div class="mb-3" id="valueContainer"></div>
            <div class="mb-3">
              <label class="form-label">Banner Image</label>
              <input type="file" name="bannerImage" id="bannerImage" class="form-control" ${isEdit ? '' : 'required'} />
              ${editData?.content?.image?.url ? 
                `<div class="mt-2">
                  <small class="text-muted">Current image:</small><br>
                  <img src="${editData.content.image.url}" width="150" class="img-thumbnail" />
                </div>` : ''
              }
              ${isEdit ? '<small class="text-muted">Leave empty to keep current image</small>' : ''}
            </div>
            <div class="d-flex gap-2">
              <button type="submit" class="btn btn-primary">${submitText}</button>
              <a href="?section=banners-list" class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </div>
    `;

    // Handle form submission
    document.getElementById('bannerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      
      try {
        let response;
        if (isEdit) {
          response = await fetch(`/sudobe/api/content/banners/${editData.id}`, {
            method: 'PUT',
            body: formData
          });
        } else {
          response = await fetch('/sudobe/api/content', {
            method: 'POST',
            body: formData
          });
        }

        if (response.ok) {
          window.location.href = '?section=banners-list&status=success&message=' + 
            encodeURIComponent(`Banner ${isEdit ? 'updated' : 'created'} successfully`);
        } else {
          alert('Error saving banner');
        }
      } catch (error) {
        console.error('Error:', error);
        alert('Error saving banner');
      }
    });

    // Setup banner type change handler
    setupBannerTypeHandler(editData);
  }

  function loadBannerEditForm(bannerId) {
    fetch(`/sudobe/api/content/banners`)
      .then(res => res.json())
      .then(banners => {
        const banner = banners.find(b => b.id === bannerId);
        if (banner) {
          loadBannerForm(banner);
        } else {
          formContainer.innerHTML = '<div class="alert alert-danger">Banner not found</div>';
        }
      })
      .catch(error => {
        console.error('Error loading banner:', error);
        formContainer.innerHTML = '<div class="alert alert-danger">Error loading banner</div>';
      });
  }

  function setupBannerTypeHandler(editData = null) {
    document.getElementById('bannerType').addEventListener('change', async (e) => {
      const type = e.target.value;
      const container = document.getElementById('valueContainer');
      container.innerHTML = '<p>Loading...</p>';

      try {
        let html = '';
        if (type === 'category') {
          const res = await fetch('/sudobe/api/content/categories');
          const categories = await res.json();
          html += `<label class="form-label">Select Category</label>
                   <select name="bannerValue" class="form-select" required>`;
          html += `<option value="">-- Select Category --</option>`;
          categories.forEach(c => {
            const selected = editData?.content?.data_id === c.id ? 'selected' : '';
            html += `<option value="${c.id}" ${selected}>${c.name}</option>`;
          });
          html += `</select>`;
        } else if (type === 'factory') {
          const res = await fetch('/sudobe/api/content/factories');
          const factories = await res.json();
          html += `<label class="form-label">Select Factory</label>
                   <select name="bannerValue" class="form-select" required>`;
          html += `<option value="">-- Select Factory --</option>`;
          factories.forEach(f => {
            const selected = editData?.content?.data_id === f.id ? 'selected' : '';
            html += `<option value="${f.id}" ${selected}>${f.content?.factory_name || f.name || 'Unnamed Factory'}</option>`;
          });
          html += `</select>`;
        } else if (type === 'product') {
          html = `
            <label class="form-label">Search Product</label>
            <div class="autocomplete position-relative">
              <input type="text" id="bannerValueInput" class="form-control" placeholder="Search for product..." autocomplete="off">
              <input type="hidden" name="bannerValue" id="bannerValue" required />
              <div id="productAutocomplete" class="autocomplete-items position-absolute w-100 border bg-white" style="z-index: 1000; max-height: 200px; overflow-y: auto;"></div>
            </div>
          `;
        }

        container.innerHTML = html;

        // Product autocomplete
        if (type === 'product') {
          setupProductAutocomplete(editData);
        }

      } catch (error) {
        console.error('Error loading options', error);
        container.innerHTML = '<div class="alert alert-danger">Error loading options.</div>';
      }
    });

    // Trigger change event if editing
    if (editData && editData.content?.link_type) {
      document.getElementById('bannerType').dispatchEvent(new Event('change'));
    }
  }

  function setupProductAutocomplete(editData = null) {
    const input = document.getElementById('bannerValueInput');
    const hiddenInput = document.getElementById('bannerValue');
    const autocomplete = document.getElementById('productAutocomplete');

    // Set initial value if editing
    if (editData?.content?.data_id) {
      hiddenInput.value = editData.content.data_id;
      // You might want to fetch and display the product name here
    }

    input.addEventListener('input', async function () {
      const term = this.value;
      if (term.length < 2) {
        autocomplete.innerHTML = '';
        return;
      }

      try {
        const res = await fetch(`/sudobe/api/content/products?search=${encodeURIComponent(term)}`);
        const products = await res.json();

        autocomplete.innerHTML = '';
        products.forEach(product => {
          const item = document.createElement('div');
          item.classList.add('p-2', 'border-bottom');
          item.style.cursor = 'pointer';
          item.innerHTML = `<strong>${product.name}</strong> <small class="text-muted">(SKU: ${product.sku || 'N/A'})</small>`;
          item.addEventListener('click', () => {
            input.value = product.name;
            hiddenInput.value = product.id;
            autocomplete.innerHTML = '';
          });
          item.addEventListener('mouseenter', () => item.classList.add('bg-light'));
          item.addEventListener('mouseleave', () => item.classList.remove('bg-light'));
          autocomplete.appendChild(item);
        });
      } catch (error) {
        console.error('Error fetching products:', error);
      }
    });

    // Close autocomplete when clicking outside
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !autocomplete.contains(e.target)) {
        autocomplete.innerHTML = '';
      }
    });
  }

  // === Protection Functions ===
  function loadProtectionList() {
    fetch('/sudobe/api/content/protections')
      .then(res => res.json())
      .then(protections => {
        let html = `
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h2>Protections</h2>
            <a href="?section=protection-form" class="btn btn-primary">Add New Protection</a>
          </div>
          <div class="table-responsive">
            <table class="table table-bordered table-striped">
              <thead class="table-dark">
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Short Description</th>
                  <th>Icon</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        if (protections && protections.length > 0) {
          protections.forEach(p => {
            html += `
              <tr>
                <td>${p.id}</td>
                <td><strong>${p.content?.title || 'N/A'}</strong></td>
                <td>${p.content?.short_description || 'N/A'}</td>
                <td>
                  ${p.content?.icon?.url ? 
                    `<img src="${p.content.icon.url}" width="40" height="40" class="img-thumbnail"/>` : 
                    '<span class="text-muted">No icon</span>'
                  }
                </td>
                <td>
                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-warning" onclick="editProtection('${p.id}')">Edit</button>
                    <button class="btn btn-danger" onclick="deleteProtection('${p.id}')">Delete</button>
                  </div>
                </td>
              </tr>
            `;
          });
        } else {
          html += `
            <tr>
              <td colspan="5" class="text-center text-muted">No protections found</td>
            </tr>
          `;
        }
        
        html += `</tbody></table></div>`;
        formContainer.innerHTML = html;
      })
      .catch(error => {
        console.error('Error loading protections:', error);
        formContainer.innerHTML = '<div class="alert alert-danger">Error loading protections</div>';
      });
  }

  function loadProtectionForm(editData = null) {
    const isEdit = editData !== null;
    const title = isEdit ? 'Edit Protection' : 'Create New Protection';
    const submitText = isEdit ? 'Save Protection' : 'Create Protection';

    formContainer.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2>${title}</h2>
        <a href="?section=protections-list" class="btn btn-secondary">Back to List</a>
      </div>
      <div class="card">
        <div class="card-body">
          <form id="protectionForm" enctype="multipart/form-data">
            <div class="mb-3">
              <label class="form-label">Protection Icon</label>
              <input type="file" name="proctectionIcon" id="protectionIcon" class="form-control" ${isEdit ? '' : 'required'} />
              ${editData?.content?.icon?.url ? 
                `<div class="mt-2">
                  <small class="text-muted">Current icon:</small><br>
                  <img src="${editData.content.icon.url}" width="80" class="img-thumbnail" />
                </div>` : ''
              }
              ${isEdit ? '<small class="text-muted">Leave empty to keep current icon</small>' : ''}
            </div>
            <div class="mb-3">
              <label class="form-label">Title</label>
              <input type="text" name="title" class="form-control" value="${editData?.content?.title || ''}" required />
            </div>
            <div class="mb-3">
              <label class="form-label">Short Description</label>
              <input type="text" name="short_description" class="form-control" value="${editData?.content?.short_description || ''}" required />
            </div>
            <div class="mb-3">
              <label class="form-label">Long Description</label>
              <textarea name="long_description" class="form-control" rows="4" required>${editData?.content?.long_description || ''}</textarea>
            </div>
            <div class="d-flex gap-2">
              <button type="submit" class="btn btn-primary">${submitText}</button>
              <a href="?section=protections-list" class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </div>
    `;

    // Handle form submission
    document.getElementById('protectionForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      
      try {
        let response;
        if (isEdit) {
          response = await fetch(`/sudobe/api/content/protections/${editData.id}`, {
            method: 'PUT',
            body: formData
          });
        } else {
          response = await fetch('/sudobe/api/content/protection', {
            method: 'POST',
            body: formData
          });
        }

        if (response.ok) {
          window.location.href = '?section=protections-list&status=success&message=' + 
            encodeURIComponent(`Protection ${isEdit ? 'updated' : 'created'} successfully`);
        } else {
          alert('Error saving protection');
        }
      } catch (error) {
        console.error('Error:', error);
        alert('Error saving protection');
      }
    });
  }

  function loadProtectionEditForm(protectionId) {
    fetch(`/sudobe/api/content/protections`)
      .then(res => res.json())
      .then(protections => {
        const protection = protections.find(p => p.id === protectionId);
        if (protection) {
          loadProtectionForm(protection);
        } else {
          formContainer.innerHTML = '<div class="alert alert-danger">Protection not found</div>';
        }
      })
      .catch(error => {
        console.error('Error loading protection:', error);
        formContainer.innerHTML = '<div class="alert alert-danger">Error loading protection</div>';
      });
  }

  // === Banking Form ===
  function loadBankingForm() {
    formContainer.innerHTML = `
      <h2>Banking Details</h2>
      <div class="card">
        <div class="card-body">
          <form action="/sudobe/api/content/banking" method="POST">
            <div class="mb-3">
              <label class="form-label">Account Number</label>
              <input type="text" name="accountNumber" class="form-control" required />
            </div>
            <div class="mb-3">
              <label class="form-label">SWIFT Code</label>
              <input type="text" name="swiftCode" class="form-control" required />
            </div>
            <div class="mb-3">
              <label class="form-label">Beneficiary Name</label>
              <input type="text" name="beneficiaryName" class="form-control" required />
            </div>
            <div class="mb-3">
              <label class="form-label">Beneficiary Address</label>
              <textarea name="beneficiaryAddress" class="form-control" rows="3" required></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">Beneficiary Bank</label>
              <input type="text" name="beneficiaryBank" class="form-control" required />
            </div>
            <div class="mb-3">
              <label class="form-label">Beneficiary Bank Address</label>
              <textarea name="beneficiaryBankAddress" class="form-control" rows="3" required></textarea>
            </div>
            <button type="submit" class="btn btn-primary">Submit Banking Details</button>
          </form>
        </div>
      </div>
    `;
  }

  // === Global Functions (attached to window for onclick handlers) ===
  window.editBanner = function(id) {
    window.location.href = `?section=banner-edit&id=${id}`;
  };

  window.deleteBanner = function(id) {
    if (!confirm('Are you sure you want to delete this banner?')) return;
    
    fetch(`/sudobe/api/content/banners/${id}`, { method: 'DELETE' })
      .then(response => {
        if (response.ok) {
          loadBannerList();
          alert('Banner deleted successfully');
        } else {
          alert('Error deleting banner');
        }
      })
      .catch(error => {
        console.error('Error:', error);
        alert('Error deleting banner');
      });
  };

  window.editProtection = function(id) {
    window.location.href = `?section=protection-edit&id=${id}`;
  };

  window.deleteProtection = function(id) {
    if (!confirm('Are you sure you want to delete this protection?')) return;
    
    fetch(`/sudobe/api/content/protections/${id}`, { method: 'DELETE' })
      .then(response => {
        if (response.ok) {
          loadProtectionList();
          alert('Protection deleted successfully');
        } else {
          alert('Error deleting protection');
        }
      })
      .catch(error => {
        console.error('Error:', error);
        alert('Error deleting protection');
      });
  };
});